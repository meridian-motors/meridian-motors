/**
 * BUYER MATCHING — deterministic, explainable, configurable weights.
 * Uses ONLY the buyer's explicitly stated vehicle preferences. It never uses
 * personal characteristics (age, gender, ethnicity, etc.) and never invents
 * buyer interest — it only ranks real buyers who opted in against real listings.
 */

export interface MatchWeights {
  budget: number; make_model: number; mileage: number; location: number; specification: number; other: number;
}
export const DEFAULT_WEIGHTS: MatchWeights = { budget: 0.3, make_model: 0.25, mileage: 0.15, location: 0.15, specification: 0.1, other: 0.05 };

export interface BuyerPreferenceInput {
  preferred_makes?: string[]; preferred_models?: string[];
  minimum_budget?: number | null; maximum_budget?: number | null;
  maximum_mileage?: number | null; minimum_year?: number | null;
  preferred_fuel?: string[]; preferred_transmission?: string[]; preferred_body_type?: string[];
  desired_features?: string[];
  latitude?: number | null; longitude?: number | null; max_distance_miles?: number | null;
}

export interface MatchVehicleInput {
  make: string; model: string; year: number; mileage: number; asking_price: number;
  fuel_type?: string | null; transmission?: string | null; body_type?: string | null;
  specification?: string[]; latitude?: number | null; longitude?: number | null;
}

export interface MatchResult {
  score: number;
  breakdown: Record<keyof MatchWeights, number>;
  reasons: string[];
  mismatches: string[];
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const lc = (s: string) => s.trim().toLowerCase();
const money = (n: number) => `£${n.toLocaleString("en-GB")}`;

export function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(a));
}

export function normaliseWeights(w: Partial<MatchWeights>): MatchWeights {
  const merged = { ...DEFAULT_WEIGHTS, ...w };
  const total = Object.values(merged).reduce((s, v) => s + Math.max(0, v), 0);
  if (total <= 0) return DEFAULT_WEIGHTS;
  return Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, Math.max(0, v) / total])) as unknown as MatchWeights;
}

export function scoreMatch(pref: BuyerPreferenceInput, v: MatchVehicleInput, weights: MatchWeights = DEFAULT_WEIGHTS): MatchResult {
  const reasons: string[] = [];
  const mismatches: string[] = [];
  const b = {} as Record<keyof MatchWeights, number>;

  // Budget
  const min = pref.minimum_budget ?? null, max = pref.maximum_budget ?? null;
  if (max == null && min == null) b.budget = 0.5;
  else if (max != null && v.asking_price > max) {
    b.budget = clamp01(1 - (v.asking_price - max) / (max * 0.15));
    mismatches.push(`Price ${money(v.asking_price)} is above your ${money(max)} budget`);
  } else if (min != null && v.asking_price < min) {
    b.budget = 0.75;
    reasons.push(`Priced below your minimum budget at ${money(v.asking_price)}`);
  } else {
    b.budget = 1;
    reasons.push(`Within your budget at ${money(v.asking_price)}`);
  }

  // Make / model
  const makes = (pref.preferred_makes ?? []).map(lc), models = (pref.preferred_models ?? []).map(lc);
  if (!makes.length && !models.length) b.make_model = 0.5;
  else if (models.includes(lc(v.model)) && (makes.length === 0 || makes.includes(lc(v.make)))) { b.make_model = 1; reasons.push(`${v.make} ${v.model} is one of your preferred models`); }
  else if (makes.includes(lc(v.make))) { b.make_model = 0.75; reasons.push(`${v.make} is one of your preferred makes`); }
  else { b.make_model = 0; mismatches.push(`${v.make} ${v.model} is not among your preferred makes or models`); }

  // Mileage
  if (pref.maximum_mileage == null) b.mileage = 0.5;
  else if (v.mileage <= pref.maximum_mileage) { b.mileage = 1; reasons.push(`${v.mileage.toLocaleString("en-GB")} miles — under your ${pref.maximum_mileage.toLocaleString("en-GB")} mile limit`); }
  else { b.mileage = clamp01(1 - (v.mileage - pref.maximum_mileage) / (pref.maximum_mileage * 0.3)); mismatches.push(`Mileage is above your ${pref.maximum_mileage.toLocaleString("en-GB")} mile limit`); }

  // Location
  if (pref.latitude == null || pref.longitude == null || v.latitude == null || v.longitude == null) b.location = 0.5;
  else {
    const d = haversineMiles(pref.latitude, pref.longitude, v.latitude, v.longitude);
    const maxD = pref.max_distance_miles ?? 50;
    if (d <= maxD) { b.location = clamp01(1 - 0.3 * (d / maxD)); reasons.push(`About ${Math.round(d)} miles away`); }
    else { b.location = clamp01(1 - (d - maxD) / maxD) * 0.6; mismatches.push(`About ${Math.round(d)} miles away — beyond your ${maxD} mile radius`); }
  }

  // Specification
  const wanted = (pref.desired_features ?? []).map(lc).filter(Boolean);
  if (!wanted.length) b.specification = 0.5;
  else {
    const spec = (v.specification ?? []).map(lc);
    const hit = wanted.filter((f) => spec.some((s) => s.includes(f)));
    b.specification = hit.length / wanted.length;
    if (hit.length) reasons.push(`Has ${hit.join(", ")}`);
    const miss = wanted.filter((f) => !hit.includes(f));
    if (miss.length) mismatches.push(`Listing does not mention ${miss.join(", ")}`);
  }

  // Other preferences
  const checks: boolean[] = [];
  const pushCheck = (prefs: string[] | undefined, value: string | null | undefined, label: string) => {
    if (!prefs?.length) return;
    const okay = !!value && prefs.includes(value);
    checks.push(okay);
    if (!okay) mismatches.push(`${label} does not match your preference`);
  };
  pushCheck(pref.preferred_fuel, v.fuel_type, "Fuel type");
  pushCheck(pref.preferred_transmission, v.transmission, "Transmission");
  pushCheck(pref.preferred_body_type, v.body_type, "Body type");
  if (pref.minimum_year != null) { const okay = v.year >= pref.minimum_year; checks.push(okay); if (!okay) mismatches.push(`Older than your minimum year (${pref.minimum_year})`); }
  b.other = checks.length ? checks.filter(Boolean).length / checks.length : 0.5;

  const score = (Object.keys(weights) as (keyof MatchWeights)[]).reduce((s, k) => s + weights[k] * b[k], 0);
  return { score: Number(clamp01(score).toFixed(3)), breakdown: b, reasons, mismatches };
}

/** True when a buyer has stated enough preferences for matching to be meaningful. */
export function hasMeaningfulPreferences(p: BuyerPreferenceInput) {
  return Boolean(p.maximum_budget || p.preferred_makes?.length || p.preferred_models?.length || p.maximum_mileage || p.preferred_body_type?.length || p.preferred_fuel?.length);
}
