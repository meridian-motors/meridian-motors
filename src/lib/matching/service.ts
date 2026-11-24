import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { scoreMatch, normaliseWeights, hasMeaningfulPreferences, type BuyerPreferenceInput } from "./engine";
import { notify } from "@/lib/notifications";
import { parseFilters } from "@/lib/search/filters";
import type { MarketplaceFilters } from "@/lib/types";

/**
 * Runs when a listing is published: scores the vehicle against buyers who have
 * OPTED IN to matching, stores real matches and notifies them. Also triggers
 * saved-search alerts. Never invents buyer interest.
 */
export async function matchPublishedListing(listingId: string) {
  const admin = createAdminClient();
  const { data: l } = await admin.from("public_listings").select("*").eq("id", listingId).maybeSingle();
  if (!l) return { matches: 0, alerts: 0 };
  const [{ data: settings }, { data: prefs }] = await Promise.all([
    admin.from("platform_settings").select("setting_key, setting_value").in("setting_key", ["matching.weights", "matching.min_score"]),
    admin.from("buyer_preferences").select("*, buyers!inner(id, profile_id, matching_opt_in)").eq("buyers.matching_opt_in", true).limit(5000),
  ]);
  const weights = normaliseWeights((settings?.find((s) => s.setting_key === "matching.weights")?.setting_value as object) ?? {});
  const minScore = Number(settings?.find((s) => s.setting_key === "matching.min_score")?.setting_value ?? 0.55);
  const vehicle = { make: l.make, model: l.model, year: l.year, mileage: l.mileage, asking_price: l.asking_price, fuel_type: l.fuel_type,
    transmission: l.transmission, body_type: l.body_type, specification: l.specification, latitude: l.latitude, longitude: l.longitude };

  let matches = 0;
  for (const p of prefs ?? []) {
    const buyer = (Array.isArray(p.buyers) ? p.buyers[0] : p.buyers) as { id: string; profile_id: string };
    if (!hasMeaningfulPreferences(p as BuyerPreferenceInput)) continue;
    // Never match a seller to their own vehicle
    const { data: own } = await admin.from("vehicles").select("id, sellers!inner(profile_id)").eq("id", l.vehicle_id).eq("sellers.profile_id", buyer.profile_id).maybeSingle();
    if (own) continue;
    const m = scoreMatch(p as BuyerPreferenceInput, vehicle, weights);
    if (m.score < minScore) continue;
    const { error } = await admin.from("buyer_matches").upsert({
      buyer_id: buyer.id, vehicle_id: l.vehicle_id, match_score: m.score, score_breakdown: m.breakdown,
      match_explanation: m.reasons.join("; "), mismatches: m.mismatches, weights_version: JSON.stringify(weights), notified_at: new Date().toISOString(),
    }, { onConflict: "buyer_id,vehicle_id" });
    if (!error) {
      matches++;
      await notify(buyer.profile_id, "buyer_match", "A new vehicle matches your preferences",
        `${l.year} ${l.make} ${l.model} at £${l.asking_price.toLocaleString("en-GB")} — ${m.reasons.slice(0, 2).join(", ")}.`, `/cars/${l.slug}`);
    }
  }

  // Saved-search alerts
  let alerts = 0;
  const { data: searches } = await admin.from("saved_searches").select("id, name, filters, buyers!inner(profile_id)").eq("alerts_enabled", true).limit(5000);
  for (const s of searches ?? []) {
    const f = parseFilters(Object.fromEntries(Object.entries(s.filters as Record<string, unknown>).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : String(v)])));
    if (!listingMatchesFilters(l, f)) continue;
    const buyer = (Array.isArray(s.buyers) ? s.buyers[0] : s.buyers) as { profile_id: string };
    await notify(buyer.profile_id, "saved_search_alert", `New match for “${s.name}”`, `${l.year} ${l.make} ${l.model} — £${l.asking_price.toLocaleString("en-GB")}`, `/cars/${l.slug}`);
    await admin.from("saved_searches").update({ last_notified_at: new Date().toISOString() }).eq("id", s.id);
    alerts++;
  }
  return { matches, alerts };
}

type L = { make: string; model: string; year: number; mileage: number; asking_price: number; fuel_type: string; transmission: string; body_type: string | null; condition: string | null; location: string | null; title: string };
export function listingMatchesFilters(l: L, f: MarketplaceFilters) {
  const lc = (s?: string | null) => (s ?? "").toLowerCase();
  if (f.make && lc(f.make) !== lc(l.make)) return false;
  if (f.model && lc(f.model) !== lc(l.model)) return false;
  if (f.minPrice && l.asking_price < f.minPrice) return false;
  if (f.maxPrice && l.asking_price > f.maxPrice) return false;
  if (f.minYear && l.year < f.minYear) return false;
  if (f.maxYear && l.year > f.maxYear) return false;
  if (f.maxMileage && l.mileage > f.maxMileage) return false;
  if (f.fuel?.length && !f.fuel.includes(l.fuel_type as never)) return false;
  if (f.transmission?.length && !f.transmission.includes(l.transmission as never)) return false;
  if (f.body?.length && (!l.body_type || !f.body.includes(l.body_type as never))) return false;
  if (f.condition?.length && (!l.condition || !f.condition.includes(l.condition as never))) return false;
  if (f.location && !lc(l.location).includes(lc(f.location))) return false;
  if (f.q && !`${l.make} ${l.model} ${l.title}`.toLowerCase().includes(f.q.toLowerCase().split(" ")[0])) return false;
  return true;
}
