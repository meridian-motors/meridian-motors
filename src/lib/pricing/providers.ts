import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ComparableInput } from "./engine";

/**
 * Licensed comparable-data provider interface.
 *
 * No third-party provider is connected yet. To add one (e.g. a licensed trade
 * valuation or retail-listing data feed):
 *  1. Implement ComparableProvider below using the provider's official API.
 *  2. Register it in IMPLEMENTATIONS with its id.
 *  3. Insert a row in public.data_providers with provider_type 'comparables',
 *     is_enabled = true and the licence reference.
 * The database rejects comparables from providers that are not enabled.
 * Never scrape competitor marketplaces.
 */
export interface ComparableProvider {
  id: string;
  displayName: string;
  fetchComparables(subject: { make: string; model: string; year: number; mileage: number; fuel_type: string | null; transmission: string | null }): Promise<Omit<ComparableInput, "source_provider">[]>;
}

const IMPLEMENTATIONS: Record<string, (displayName: string) => ComparableProvider> = {
  // example_licensed_feed: (name) => new ExampleLicensedFeed(name),
};

export async function getComparableProviders(): Promise<ComparableProvider[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("data_providers").select("id, display_name").eq("provider_type", "comparables").eq("is_enabled", true);
  return (data ?? []).filter((p) => IMPLEMENTATIONS[p.id]).map((p) => IMPLEMENTATIONS[p.id](p.display_name));
}
