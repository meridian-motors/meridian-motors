/**
 * MERIDIAN FAST SALE ENGINE — deterministic valuation.
 *
 * All numbers produced here are calculated from REAL comparable records passed
 * in by the caller (Meridian completed sales, Meridian listings, or licensed
 * provider data). Nothing is invented: if there is not enough evidence the
 * engine returns `insufficient_data` and no prices.
 *
 * AI is only ever used afterwards to phrase an explanation of these numbers.
 */

export const ENGINE_VERSION = "fse-1.2.0";

export type Condition = "excellent" | "very_good" | "good" | "fair" | "poor";

export interface SubjectVehicle {
  make: string;
  model: string;
  derivative?: string | null;
  year: number;
  mileage: number;
  fuel_type?: string | null;
  transmission?: string | null;
  condition?: Condition | null;
  service_history?: "full" | "partial" | "none" | "unknown" | null;
}

export interface ComparableInput {
  source_provider: string;      // meridian_completed_sale | meridian_listing | licensed:<id>
  external_reference: string;
  make: string;
  model: string;
  derivative?: string | null;
  year: number;
  mileage: number;
  fuel_type?: string | null;
  transmission?: string | null;
  condition?: Condition | null;
  price: number;
  price_type: "asking" | "sold";
  source_date: string;          // ISO date
}

export interface EngineConfig {
  minComparables: number;
  yearTolerance: number;
  mileageTolerancePct: number;
  fastSalePercentile: number;
  now?: Date;
}

export const DEFAULT_CONFIG: EngineConfig = {
  minComparables: 3,
  yearTolerance: 2,
  mileageTolerancePct: 0.35,
  fastSalePercentile: 0.25,
};

export interface ScoredComparable extends ComparableInput {
  adjusted_price: number;
  similarity: number;
  weight: number;
}

export type Positioning = "fast_sale" | "competitive" | "market" | "above_market";

export interface ValuationResult {
  status: "completed" | "insufficient_data";
  engine_version: string;
  market_value_min: number | null;
  market_value_max: number | null;
  market_value_mid: number | null;
  recommended_asking_price: number | null;
  fast_sale_price: number | null;
  confidence_score: number | null;
  comparables: ScoredComparable[];
  considered_count: number;
  excluded: { reference: string; reason: string }[];
  data_limitations: string[];
  explanation: string;
  factors: { label: string; effect: string }[];
}

const CONDITION_FACTOR: Record<Condition, number> = { excellent: 1.04, very_good: 1.0, good: 0.97, fair: 0.92, poor: 0.82 };
const SERVICE_FACTOR = { full: 1.02, partial: 0.98, none: 0.94, unknown: 1.0 } as const;
const MILEAGE_RATE_PER_10K = 0.045;  // value change per 10,000 miles difference
const YEAR_RATE = 0.075;             // value change per model year difference
const SOLD_TO_ASKING = 1.03;         // sold prices are typically below advertised prices
const RECENCY_HALF_LIFE_DAYS = 90;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const norm = (s?: string | null) => (s ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Round to a sensible advertised price (e.g. £8,495 / £12,250 / £34,950). */
export function roundAdvertised(n: number) {
  if (n < 1000) return Math.round(n / 10) * 10;
  if (n < 10000) return Math.max(Math.round(n / 50) * 50 - 5, 100);
  if (n < 50000) {
    const r = Math.round(n / 250) * 250;
    return r % 500 === 0 ? r - 5 : r;
  }
  return Math.round(n / 500) * 500;
}

function weightedPercentile(values: { v: number; w: number }[], p: number) {
  const sorted = [...values].sort((a, b) => a.v - b.v);
  const total = sorted.reduce((s, x) => s + x.w, 0);
  if (total === 0 || sorted.length === 0) return NaN;
  let acc = 0;
  for (let i = 0; i < sorted.length; i++) {
    const next = acc + sorted[i].w;
    // midpoint interpolation
    if ((acc + next) / 2 / total >= p) {
      if (i === 0) return sorted[0].v;
      const prevMid = (acc - sorted[i - 1].w / 2) / total;
      const curMid = (acc + sorted[i].w / 2) / total;
      const t = curMid === prevMid ? 1 : (p - prevMid) / (curMid - prevMid);
      return sorted[i - 1].v + clamp(t, 0, 1) * (sorted[i].v - sorted[i - 1].v);
    }
    acc = next;
  }
  return sorted[sorted.length - 1].v;
}

export function adjustComparable(subject: SubjectVehicle, c: ComparableInput) {
  let price = c.price_type === "sold" ? c.price * SOLD_TO_ASKING : c.price;
  const mileageFactor = clamp(1 - (MILEAGE_RATE_PER_10K * (subject.mileage - c.mileage)) / 10000, 0.75, 1.25);
  const yearFactor = clamp(1 + YEAR_RATE * (subject.year - c.year), 0.75, 1.3);
  const condFactor = subject.condition && c.condition ? CONDITION_FACTOR[subject.condition] / CONDITION_FACTOR[c.condition] : 1;
  price = price * mileageFactor * yearFactor * condFactor;
  return Math.round(price);
}

export function similarity(subject: SubjectVehicle, c: ComparableInput, cfg: EngineConfig) {
  const mileageWindow = Math.max(subject.mileage * cfg.mileageTolerancePct, 10000);
  let s = 1;
  s -= (Math.abs(subject.year - c.year) / (cfg.yearTolerance + 1)) * 0.35;
  s -= clamp(Math.abs(subject.mileage - c.mileage) / mileageWindow, 0, 1) * 0.35;
  if (subject.derivative && c.derivative && norm(subject.derivative) !== norm(c.derivative)) s -= 0.1;
  if (subject.condition && c.condition && subject.condition !== c.condition) s -= 0.05;
  return clamp(Number(s.toFixed(3)), 0.05, 1);
}

export function valueVehicle(subject: SubjectVehicle, inputs: ComparableInput[], config: Partial<EngineConfig> = {}): ValuationResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const now = cfg.now ?? new Date();
  const excluded: { reference: string; reason: string }[] = [];
  const mileageWindow = Math.max(subject.mileage * cfg.mileageTolerancePct, 10000);
  const limitations: string[] = [];

  // 1. Eligibility
  const eligible = inputs.filter((c) => {
    const ref = `${c.source_provider}:${c.external_reference}`;
    if (!c.external_reference || !c.source_provider) { excluded.push({ reference: ref, reason: "missing source" }); return false; }
    if (!(c.price > 0)) { excluded.push({ reference: ref, reason: "invalid price" }); return false; }
    if (norm(c.make) !== norm(subject.make) || norm(c.model) !== norm(subject.model)) { excluded.push({ reference: ref, reason: "different make/model" }); return false; }
    if (Math.abs(c.year - subject.year) > cfg.yearTolerance) { excluded.push({ reference: ref, reason: "outside year range" }); return false; }
    if (Math.abs(c.mileage - subject.mileage) > mileageWindow) { excluded.push({ reference: ref, reason: "outside mileage range" }); return false; }
    if (subject.fuel_type && c.fuel_type && subject.fuel_type !== c.fuel_type) { excluded.push({ reference: ref, reason: "different fuel type" }); return false; }
    if (subject.transmission && c.transmission && subject.transmission !== c.transmission) { excluded.push({ reference: ref, reason: "different transmission" }); return false; }
    const ageDays = (now.getTime() - new Date(c.source_date).getTime()) / 86400000;
    if (ageDays > 365) { excluded.push({ reference: ref, reason: "older than 12 months" }); return false; }
    if (ageDays < -1) { excluded.push({ reference: ref, reason: "future-dated" }); return false; }
    return true;
  });

  // 2. Adjust & weight
  let scored: ScoredComparable[] = eligible.map((c) => {
    const ageDays = Math.max(0, (now.getTime() - new Date(c.source_date).getTime()) / 86400000);
    const recency = Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
    const sim = similarity(subject, c, cfg);
    const typeWeight = c.price_type === "sold" ? 1.25 : 1;
    return { ...c, adjusted_price: adjustComparable(subject, c), similarity: sim, weight: Number((sim * (0.4 + 0.6 * recency) * typeWeight).toFixed(4)) };
  });

  // 3. Outlier removal (Tukey fences on adjusted prices) when we have enough points
  if (scored.length >= 5) {
    const prices = scored.map((s) => s.adjusted_price).sort((a, b) => a - b);
    const q = (p: number) => weightedPercentile(prices.map((v) => ({ v, w: 1 })), p);
    const q1 = q(0.25), q3 = q(0.75), iqr = q3 - q1;
    const lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
    scored = scored.filter((s) => {
      const keep = s.adjusted_price >= lo && s.adjusted_price <= hi;
      if (!keep) excluded.push({ reference: `${s.source_provider}:${s.external_reference}`, reason: "price outlier" });
      return keep;
    });
  }

  if (subject.condition == null) limitations.push("Vehicle condition has not been declared, so no condition adjustment was applied.");
  limitations.push("Condition and history are seller-declared and have not been physically inspected.");
  if (scored.some((s) => s.price_type === "asking")) limitations.push("Some evidence is advertised asking prices, which can differ from achieved sale prices.");

  if (scored.length < cfg.minComparables) {
    return {
      status: "insufficient_data",
      engine_version: ENGINE_VERSION,
      market_value_min: null, market_value_max: null, market_value_mid: null,
      recommended_asking_price: null, fast_sale_price: null, confidence_score: null,
      comparables: scored, considered_count: inputs.length, excluded,
      data_limitations: [
        `Only ${scored.length} suitable comparable vehicle${scored.length === 1 ? "" : "s"} found; at least ${cfg.minComparables} are required for a reliable valuation.`,
        ...limitations,
      ],
      explanation: `We could not produce a reliable valuation for this ${subject.year} ${subject.make} ${subject.model} because there is not yet enough verified market evidence for similar vehicles. A Meridian specialist can review it manually, or you can set your own asking price.`,
      factors: [],
    };
  }

  // 4. Weighted distribution
  const pts = scored.map((s) => ({ v: s.adjusted_price, w: s.weight }));
  const serviceFactor = SERVICE_FACTOR[subject.service_history ?? "unknown"];
  const p25 = weightedPercentile(pts, 0.25) * serviceFactor;
  const p50 = weightedPercentile(pts, 0.5) * serviceFactor;
  const p75 = weightedPercentile(pts, 0.75) * serviceFactor;
  const pFast = weightedPercentile(pts, cfg.fastSalePercentile) * serviceFactor;

  const marketMin = Math.round(Math.min(p25, p50) / 50) * 50;
  const marketMax = Math.round(Math.max(p75, p50) / 50) * 50;
  const recommended = roundAdvertised(p50);
  let fastSale = roundAdvertised(Math.min(pFast, p50 * 0.96));
  if (fastSale >= recommended) fastSale = roundAdvertised(recommended * 0.96);

  // 5. Confidence (never claims certainty)
  const n = scored.length;
  const mean = scored.reduce((s, c) => s + c.adjusted_price, 0) / n;
  const sd = Math.sqrt(scored.reduce((s, c) => s + (c.adjusted_price - mean) ** 2, 0) / n);
  const cv = mean > 0 ? sd / mean : 1;
  const avgSim = scored.reduce((s, c) => s + c.similarity, 0) / n;
  const soldShare = scored.filter((c) => c.price_type === "sold").length / n;
  const confidence = clamp(0.2 + 0.3 * Math.min(n / 12, 1) + 0.25 * (1 - Math.min(cv / 0.2, 1)) + 0.15 * avgSim + 0.05 * soldShare, 0.05, 0.92);

  const factors = [
    { label: "Comparable vehicles", effect: `${n} similar ${subject.make} ${subject.model}s within ±${cfg.yearTolerance} years and a comparable mileage band` },
    { label: "Mileage", effect: `Each comparable adjusted by ~${(MILEAGE_RATE_PER_10K * 100).toFixed(1)}% per 10,000 miles difference` },
    { label: "Age", effect: `Each comparable adjusted by ~${(YEAR_RATE * 100).toFixed(1)}% per model year difference` },
    { label: "Service history", effect: serviceFactor === 1 ? "No adjustment" : `${serviceFactor > 1 ? "+" : ""}${((serviceFactor - 1) * 100).toFixed(0)}% for ${subject.service_history} service history` },
    { label: "Condition", effect: subject.condition ? `Adjusted relative to each comparable's stated condition (${subject.condition.replace("_", " ")})` : "Not declared — no adjustment" },
    { label: "Recency", effect: "Recent evidence weighted more heavily (90-day half-life); completed sales weighted above asking prices" },
  ];

  const explanation =
    `Based on ${n} comparable ${subject.make} ${subject.model} vehicles, adjusted for age, mileage and condition, similar vehicles are typically advertised between ` +
    `£${marketMin.toLocaleString("en-GB")} and £${marketMax.toLocaleString("en-GB")}. ` +
    `A suggested asking price of £${recommended.toLocaleString("en-GB")} positions your vehicle in line with the market. ` +
    `A fast-sale price of £${fastSale.toLocaleString("en-GB")} places it among the most competitively priced similar vehicles, ` +
    `which typically attracts more serious buyer interest sooner — but it is a trade-off against the amount you receive. ` +
    `This is an indicative valuation, not a guaranteed sale price, and no particular sale timescale is guaranteed.`;

  return {
    status: "completed",
    engine_version: ENGINE_VERSION,
    market_value_min: marketMin,
    market_value_max: marketMax,
    market_value_mid: Math.round(p50),
    recommended_asking_price: recommended,
    fast_sale_price: fastSale,
    confidence_score: Number(confidence.toFixed(3)),
    comparables: scored.sort((a, b) => b.weight - a.weight),
    considered_count: inputs.length,
    excluded,
    data_limitations: limitations,
    explanation,
    factors,
  };
}

/** Where a proposed price sits relative to the valuation. */
export function pricePositioning(price: number, v: Pick<ValuationResult, "fast_sale_price" | "market_value_min" | "market_value_max" | "recommended_asking_price">): Positioning | null {
  if (!v.fast_sale_price || !v.market_value_min || !v.market_value_max || !v.recommended_asking_price) return null;
  if (price <= v.fast_sale_price) return "fast_sale";
  if (price < v.recommended_asking_price) return "competitive";
  if (price <= v.market_value_max) return "market";
  return "above_market";
}

export const POSITIONING_COPY: Record<Positioning, { label: string; description: string }> = {
  fast_sale: { label: "Fast-sale positioning", description: "Among the most competitive similar vehicles — likely to attract the strongest early interest." },
  competitive: { label: "Competitive", description: "Below the typical asking price for similar vehicles." },
  market: { label: "In line with the market", description: "Within the typical advertised range for similar vehicles." },
  above_market: { label: "Above market", description: "Higher than similar vehicles — expect fewer enquiries and a longer time to sell." },
};

/** Market intelligence: suggest (never apply) a price review from real listing signals. */
export function priceReviewSignal(input: {
  daysListed: number; views: number; enquiries: number; saves: number; askingPrice: number;
  fastSalePrice?: number | null; minimumAuthorised?: number | null;
}): { recommend: boolean; reasons: string[]; suggestedPrice: number | null } {
  const reasons: string[] = [];
  if (input.daysListed >= 21 && input.enquiries === 0) reasons.push(`No enquiries after ${input.daysListed} days listed`);
  if (input.views >= 150 && input.enquiries / Math.max(input.views, 1) < 0.005) reasons.push("Viewed often but rarely enquired about — price may be deterring buyers");
  if (input.daysListed >= 35 && input.enquiries <= 1) reasons.push("Time on market is longer than typical with very little interest");
  const recommend = reasons.length > 0 && !!input.fastSalePrice && input.fastSalePrice < input.askingPrice;
  let suggested = recommend ? input.fastSalePrice! : null;
  if (suggested != null && input.minimumAuthorised != null && suggested < input.minimumAuthorised) suggested = input.minimumAuthorised;
  if (suggested != null && suggested >= input.askingPrice) suggested = null;
  return { recommend: recommend && suggested != null, reasons, suggestedPrice: suggested };
}
