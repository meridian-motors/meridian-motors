import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { geocodeOutcode } from "@/lib/geo";
import { PAGE_SIZE } from "@/lib/search/filters";
import type { ListingCardData, MarketplaceFilters, PublicListing } from "@/lib/types";

export interface SearchResult { total: number; items: ListingCardData[]; page: number; pageCount: number; error?: string; geocodeFailed?: boolean }

/** Marketplace search — only ever reads the public_listings view via RPC. */
export async function searchListings(f: MarketplaceFilters): Promise<SearchResult> {
  const page = f.page ?? 1;
  if (!isSupabaseConfigured) return { total: 0, items: [], page, pageCount: 0, error: "The marketplace database is not configured." };
  const supabase = await createClient();
  let coords: { lat: number; lng: number } | null = null;
  let geocodeFailed = false;
  if (f.postcode) {
    coords = await geocodeOutcode(f.postcode);
    geocodeFailed = !coords;
  }
  const { data, error } = await supabase.rpc("search_listings", {
    p_query: f.q ?? null, p_make: f.make ?? null, p_model: f.model ?? null,
    p_min_price: f.minPrice ?? null, p_max_price: f.maxPrice ?? null, p_min_year: f.minYear ?? null, p_max_year: f.maxYear ?? null,
    p_max_mileage: f.maxMileage ?? null, p_fuel: f.fuel ?? null, p_transmission: f.transmission ?? null, p_body: f.body ?? null,
    p_condition: f.condition ?? null, p_location: f.location ?? null, p_lat: coords?.lat ?? null, p_lng: coords?.lng ?? null,
    p_radius_miles: coords ? f.radius ?? 50 : null,
    p_sort: f.sort === "distance" && !coords ? "newest" : f.sort ?? (f.q ? "relevance" : "newest"),
    p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE,
  });
  if (error) {
    console.error("[search_listings]", error.message);
    return { total: 0, items: [], page, pageCount: 0, error: "Search is temporarily unavailable. Please try again." };
  }
  const total = Number((data as { total: number }).total ?? 0);
  return { total, items: (data as { items: ListingCardData[] }).items ?? [], page, pageCount: Math.ceil(total / PAGE_SIZE), geocodeFailed };
}

export const getListingBySlug = cache(async (slug: string): Promise<PublicListing | null> => {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("public_listings").select("*").eq("slug", slug).maybeSingle();
  return (data as PublicListing) ?? null;
});

const CARD_COLUMNS = "id, slug, vehicle_id, title, asking_price, make, model, derivative, year, mileage, fuel_type, transmission, body_type, location, postcode_district, seller_type, primary_image_url, featured, published_at, short_description";

export async function getSimilarListings(l: PublicListing, limit = 4): Promise<ListingCardData[]> {
  const supabase = await createClient();
  const { data: sameModel } = await supabase.from("public_listings").select(CARD_COLUMNS)
    .eq("make", l.make).neq("id", l.id).gte("asking_price", Math.round(l.asking_price * 0.6)).lte("asking_price", Math.round(l.asking_price * 1.4))
    .order("published_at", { ascending: false }).limit(limit);
  const results = (sameModel ?? []) as ListingCardData[];
  if (results.length < limit) {
    const { data: more } = await supabase.from("public_listings").select(CARD_COLUMNS)
      .neq("id", l.id).gte("asking_price", Math.round(l.asking_price * 0.75)).lte("asking_price", Math.round(l.asking_price * 1.25))
      .order("published_at", { ascending: false }).limit(limit * 2);
    for (const m of (more ?? []) as ListingCardData[]) if (results.length < limit && !results.some((r) => r.id === m.id)) results.push(m);
  }
  return results;
}

export async function getFeaturedListings(limit = 6) {
  if (!isSupabaseConfigured) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("public_listings").select(CARD_COLUMNS).eq("featured", true).order("published_at", { ascending: false }).limit(limit);
  return (data ?? []) as ListingCardData[];
}

export async function getRecentListings(limit = 8) {
  if (!isSupabaseConfigured) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("public_listings").select(CARD_COLUMNS).order("published_at", { ascending: false }).limit(limit);
  return (data ?? []) as ListingCardData[];
}

export const getFacets = cache(async () => {
  if (!isSupabaseConfigured) return { makes: [], models: [], total: 0 };
  const supabase = await createClient();
  const { data } = await supabase.rpc("marketplace_facets");
  return (data ?? { makes: [], models: [], total: 0 }) as { makes: { make: string; count: number }[]; models: { make: string; model: string; count: number }[]; total: number };
});

export async function getSavedVehicleIds(): Promise<Set<string>> {
  if (!isSupabaseConfigured) return new Set();
  const supabase = await createClient();
  const { data } = await supabase.from("saved_vehicles").select("vehicle_id");
  return new Set((data ?? []).map((r) => r.vehicle_id as string));
}

export async function getPublicFeeTiers() {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("platform_settings").select("setting_value").eq("setting_key", "fees.sale_fee_tiers").maybeSingle();
  return (data?.setting_value as { min: number; max: number | null; fee: number }[] | undefined) ?? null;
}
