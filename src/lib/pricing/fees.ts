export interface FeeTier { min: number; max: number | null; fee: number }

export const DEFAULT_FEE_TIERS: FeeTier[] = [
  { min: 2000, max: 4999, fee: 149 },
  { min: 5000, max: 9999, fee: 199 },
  { min: 10000, max: 19999, fee: 249 },
  { min: 20000, max: 34999, fee: 299 },
  { min: 35000, max: null, fee: 399 },
];

/** Mirrors public.calculate_sale_fee() — the database is authoritative at completion. */
export function calculateSaleFee(price: number, tiers: FeeTier[] = DEFAULT_FEE_TIERS) {
  const tier = [...tiers].sort((a, b) => b.min - a.min).find((t) => price >= t.min && (t.max == null || price <= t.max));
  return tier ? tier.fee : 0;
}

export function validateFeeTiers(tiers: FeeTier[]): string | null {
  const sorted = [...tiers].sort((a, b) => a.min - b.min);
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    if (!Number.isInteger(t.min) || t.min < 0) return "Tier minimums must be whole numbers of at least 0";
    if (t.max != null && t.max < t.min) return "A tier maximum cannot be below its minimum";
    if (!(t.fee >= 0)) return "Fees cannot be negative";
    if (t.max == null && i !== sorted.length - 1) return "Only the highest tier can be open-ended";
    if (i > 0) {
      const prev = sorted[i - 1];
      if (prev.max == null || t.min <= prev.max) return "Tiers must not overlap";
    }
  }
  return null;
}
