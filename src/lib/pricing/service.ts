import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { valueVehicle, DEFAULT_CONFIG, type ComparableInput, type SubjectVehicle, type ValuationResult } from "./engine";
import { getComparableProviders } from "./providers";
import { aiExplainValuation } from "@/lib/ai/tasks";
import { isAiConfigured } from "@/lib/ai/run";
import type { Vehicle } from "@/lib/types";

async function loadConfig(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin.from("platform_settings").select("setting_key, setting_value").like("setting_key", "pricing.%");
  const get = (k: string, d: number) => Number(data?.find((s) => s.setting_key === k)?.setting_value ?? d);
  return {
    minComparables: get("pricing.min_comparables", DEFAULT_CONFIG.minComparables),
    yearTolerance: get("pricing.year_tolerance", DEFAULT_CONFIG.yearTolerance),
    mileageTolerancePct: get("pricing.mileage_tolerance_pct", DEFAULT_CONFIG.mileageTolerancePct),
    fastSalePercentile: get("pricing.fast_sale_percentile", DEFAULT_CONFIG.fastSalePercentile),
    validityDays: get("pricing.valuation_validity_days", 30),
  };
}

/** Gathers REAL comparable evidence from authorised sources only. */
export async function gatherComparables(v: Vehicle, cfg: { yearTolerance: number }): Promise<{ comps: ComparableInput[]; sources: string[] }> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 365 * 86400_000).toISOString();
  const yearMin = (v.year ?? 0) - cfg.yearTolerance, yearMax = (v.year ?? 0) + cfg.yearTolerance;
  const sources: string[] = [];

  const [{ data: sold }, { data: listed }] = await Promise.all([
    admin.from("transactions")
      .select("id, agreed_price, completed_at, vehicles!inner(id, make, model, derivative, year, mileage, fuel_type, transmission, condition)")
      .eq("sale_status", "completed").gte("completed_at", since)
      .ilike("vehicles.make", v.make!).ilike("vehicles.model", v.model!)
      .gte("vehicles.year", yearMin).lte("vehicles.year", yearMax).limit(200),
    admin.from("listings")
      .select("id, asking_price, published_at, vehicle_id, vehicles!inner(id, make, model, derivative, year, mileage, fuel_type, transmission, condition)")
      .not("published_at", "is", null).not("asking_price", "is", null).gte("published_at", since).neq("vehicle_id", v.id)
      .ilike("vehicles.make", v.make!).ilike("vehicles.model", v.model!)
      .gte("vehicles.year", yearMin).lte("vehicles.year", yearMax).limit(300),
  ]);

  type Row = { make: string; model: string; derivative: string | null; year: number; mileage: number; fuel_type: string | null; transmission: string | null; condition: ComparableInput["condition"] };
  const one = (x: unknown) => (Array.isArray(x) ? x[0] : x) as Row;
  const comps: ComparableInput[] = [];
  for (const s of sold ?? []) {
    const r = one(s.vehicles);
    comps.push({ source_provider: "meridian_completed_sale", external_reference: s.id, ...r, price: s.agreed_price, price_type: "sold", source_date: String(s.completed_at).slice(0, 10) });
  }
  for (const l of listed ?? []) {
    const r = one(l.vehicles);
    comps.push({ source_provider: "meridian_listing", external_reference: l.id, ...r, price: l.asking_price!, price_type: "asking", source_date: String(l.published_at).slice(0, 10) });
  }
  if (sold?.length) sources.push("Meridian completed sales");
  if (listed?.length) sources.push("Meridian marketplace listings");

  for (const provider of await getComparableProviders()) {
    try {
      const extra = await provider.fetchComparables({ make: v.make!, model: v.model!, year: v.year!, mileage: v.mileage!, fuel_type: v.fuel_type, transmission: v.transmission });
      comps.push(...extra.map((c) => ({ ...c, source_provider: `licensed:${provider.id}` })));
      sources.push(provider.displayName);
    } catch (e) {
      console.error(`[valuation] provider ${provider.id} failed`, e);
    }
  }
  return { comps, sources };
}

const moneyInText = (t: string) => Array.from(t.matchAll(/£\s?([\d,]+)/g)).map((m) => Number(m[1].replace(/,/g, "")));

export async function runValuation(vehicleId: string, requestedBy: string | null): Promise<{ valuationId: string; result: ValuationResult }> {
  const admin = createAdminClient();
  const { data: vehicle, error } = await admin.from("vehicles").select("*").eq("id", vehicleId).single();
  if (error || !vehicle) throw new Error("Vehicle not found");
  const v = vehicle as Vehicle;
  if (!v.make || !v.model || !v.year || v.mileage == null) throw new Error("Make, model, year and mileage are required for a valuation");

  const cfg = await loadConfig(admin);
  const { comps, sources } = await gatherComparables(v, cfg);
  const subject: SubjectVehicle = { make: v.make, model: v.model, derivative: v.derivative, year: v.year, mileage: v.mileage, fuel_type: v.fuel_type,
    transmission: v.transmission, condition: v.condition, service_history: v.service_history };
  const result = valueVehicle(subject, comps, cfg);

  const { data: valuation, error: insErr } = await admin.from("valuations").insert({
    vehicle_id: vehicleId, engine_version: result.engine_version, valuation_status: "pending", requested_by: requestedBy,
    valuation_source: sources.length ? sources.join(" + ") : "No comparable data source available",
    inputs: { subject, considered: result.considered_count, excluded: result.excluded.slice(0, 50), factors: result.factors, config: cfg },
  }).select("id").single();
  if (insErr || !valuation) throw new Error(insErr?.message ?? "Could not create valuation");

  if (result.comparables.length) {
    const { error: compErr } = await admin.from("comparable_vehicles").insert(result.comparables.slice(0, 40).map((c) => ({
      valuation_id: valuation.id, source_provider: c.source_provider, external_reference: c.external_reference,
      vehicle_details: { make: c.make, model: c.model, derivative: c.derivative, year: c.year, mileage: c.mileage, fuel_type: c.fuel_type, transmission: c.transmission, condition: c.condition },
      observed_price: c.price, adjusted_price: c.adjusted_price, similarity: c.similarity, price_type: c.price_type, source_date: c.source_date,
    })));
    if (compErr) throw new Error(`Comparable evidence rejected: ${compErr.message}`);
  }

  let explanation = result.explanation;
  let explanationSource: "deterministic" | "ai" = "deterministic";
  if (result.status === "completed" && isAiConfigured()) {
    const ai = await aiExplainValuation({
      vehicle: `${v.year} ${v.make} ${v.model}`, marketMin: result.market_value_min!, marketMax: result.market_value_max!,
      asking: result.recommended_asking_price!, fastSale: result.fast_sale_price!, confidence: result.confidence_score!,
      comparableCount: result.comparables.length, limitations: result.data_limitations,
    }, requestedBy, vehicleId);
    if (ai.ok) {
      const text = `${ai.data.explanation}\n\n${ai.data.trade_off}`;
      const allowed = new Set([result.market_value_min, result.market_value_max, result.recommended_asking_price, result.fast_sale_price].map(Number));
      // Discard AI wording if it introduced any figure the engine did not produce.
      if (moneyInText(text).every((n) => allowed.has(n))) { explanation = text; explanationSource = "ai"; }
    }
  }

  const completed = result.status === "completed";
  const { error: upErr } = await admin.from("valuations").update({
    valuation_status: result.status,
    market_value_min: result.market_value_min, market_value_max: result.market_value_max,
    recommended_asking_price: result.recommended_asking_price, fast_sale_price: result.fast_sale_price,
    confidence_score: result.confidence_score, valuation_explanation: explanation, explanation_source: explanationSource,
    data_limitations: result.data_limitations,
    valid_until: completed ? new Date(Date.now() + cfg.validityDays * 86400_000).toISOString() : null,
  }).eq("id", valuation.id);
  if (upErr) throw new Error(upErr.message);

  if (completed) {
    await admin.from("price_recommendations").insert([
      { vehicle_id: vehicleId, valuation_id: valuation.id, recommended_price: result.recommended_asking_price, recommendation_type: "asking",
        explanation: "In line with similar vehicles currently on the market.", confidence_score: result.confidence_score, created_by: requestedBy },
      { vehicle_id: vehicleId, valuation_id: valuation.id, recommended_price: result.fast_sale_price, recommendation_type: "fast_sale",
        explanation: "Positioned among the most competitive similar vehicles to attract serious buyers sooner.", confidence_score: result.confidence_score, created_by: requestedBy },
    ]);
  }

  const { data: seller } = await admin.from("sellers").select("profile_id").eq("id", v.owner_id ?? "").maybeSingle();
  if (seller?.profile_id) {
    await admin.rpc("notify", {
      p_profile: seller.profile_id, p_type: "valuation_ready",
      p_title: completed ? "Your valuation is ready" : "Valuation update",
      p_message: completed
        ? `Your indicative valuation for the ${v.year} ${v.make} ${v.model} is ready to review.`
        : `There is not yet enough market evidence to value your ${v.year} ${v.make} ${v.model} automatically. A Meridian specialist will review it.`,
      p_link: `/dashboard/vehicles/${vehicleId}#pricing`,
    });
  }
  return { valuationId: valuation.id, result };
}
