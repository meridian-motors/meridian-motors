import { z } from "zod";
import type { MarketplaceFilters } from "@/lib/types";

const FUELS = ["petrol", "diesel", "hybrid", "plug_in_hybrid", "electric", "lpg", "other"] as const;
const TRANS = ["manual", "automatic", "semi_automatic"] as const;
const BODIES = ["hatchback", "saloon", "estate", "suv", "coupe", "convertible", "mpv", "pickup", "van", "other"] as const;
const CONDS = ["excellent", "very_good", "good", "fair", "poor"] as const;
const SORTS = ["newest", "price_asc", "price_desc", "mileage_asc", "relevance", "distance"] as const;

const intParam = z.coerce.number().int().min(0).max(10_000_000).optional().catch(undefined);
const listOf = <T extends readonly [string, ...string[]]>(vals: T) =>
  z.preprocess((v) => (typeof v === "string" ? v.split(",").filter(Boolean) : v), z.array(z.enum(vals)).optional()).catch(undefined);

export const filtersSchema = z.object({
  q: z.string().trim().max(200).optional().catch(undefined),
  make: z.string().trim().max(40).optional().catch(undefined),
  model: z.string().trim().max(60).optional().catch(undefined),
  minPrice: intParam, maxPrice: intParam, minYear: intParam, maxYear: intParam, maxMileage: intParam,
  fuel: listOf(FUELS), transmission: listOf(TRANS), body: listOf(BODIES), condition: listOf(CONDS),
  location: z.string().trim().max(80).optional().catch(undefined),
  postcode: z.string().trim().max(10).optional().catch(undefined),
  radius: z.coerce.number().int().min(1).max(500).optional().catch(undefined),
  sort: z.enum(SORTS).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(500).optional().catch(undefined),
});

export function parseFilters(params: Record<string, string | string[] | undefined>): MarketplaceFilters {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") flat[k] = Array.isArray(v) ? v.join(",") : v;
  return filtersSchema.parse(flat) as MarketplaceFilters;
}

export function filtersToQuery(f: MarketplaceFilters): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    if (k === "page" && v === 1) continue;
    sp.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  return sp.toString();
}

export function activeFilterCount(f: MarketplaceFilters) {
  return Object.entries(f).filter(([k, v]) => !["sort", "page", "q"].includes(k) && v != null && v !== "" && !(Array.isArray(v) && v.length === 0)).length;
}

export const PAGE_SIZE = 24;
