import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, SearchX, Sparkles } from "lucide-react";
import { searchListings, getFacets, getSavedVehicleIds } from "@/lib/data/listings";
import { parseFilters, filtersToQuery } from "@/lib/search/filters";
import { getSession } from "@/lib/auth";
import { VehicleGrid } from "@/components/marketplace/vehicle-card";
import { ActiveFilterChips, MarketplaceFiltersPanel, SortSelect } from "@/components/marketplace/filters";
import { MarketplaceSearchBar } from "@/components/marketplace/search-bar";
import { SaveSearchButton } from "@/components/marketplace/save-search";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const f = parseFilters(await searchParams);
  const subject = [f.make, f.model].filter(Boolean).join(" ") || "Used cars";
  const indexable = Object.keys(f).every((k) => ["make", "model"].includes(k));
  return {
    title: `${subject} for sale`,
    description: `Browse ${subject.toLowerCase()} for sale on Meridian Motors — reviewed listings from private sellers across the UK with clear disclosures and transparent pricing.`,
    alternates: { canonical: `/cars${f.make ? `?${filtersToQuery({ make: f.make, model: f.model })}` : ""}` },
    robots: indexable ? undefined : { index: false, follow: true },
  };
}

export default async function MarketplacePage({ searchParams }: Props) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const [session, facets, result] = await Promise.all([getSession(), getFacets(), searchListings(filters)]);
  const savedIds = session ? await getSavedVehicleIds() : new Set<string>();
  const page = result.page;
  const pageHref = (p: number) => `/cars?${filtersToQuery({ ...filters, page: p })}`;
  const heading = [filters.make, filters.model].filter(Boolean).join(" ") || "All vehicles";

  return (
    <div className="container-page py-10 lg:py-12">
      <div className="mb-6">
        <p className="eyebrow">Marketplace</p>
        <h1 className="mt-2 text-3xl font-semibold">{heading}</h1>
      </div>
      <div className="mb-6"><MarketplaceSearchBar filters={filters} /></div>
      {sp.ai ? (
        <Alert tone="neutral" className="mb-6"><span className="inline-flex items-center gap-1.5"><Sparkles className="size-3.5 text-accent" />Your description was translated into the filters below. Results are live listings only — adjust any filter to refine.</span></Alert>
      ) : null}
      <div className="grid gap-8 lg:grid-cols-[290px_1fr]">
        <MarketplaceFiltersPanel filters={filters} facets={facets} />
        <section aria-label="Results" aria-live="polite">
          <div className="mb-5 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[14px] text-slate"><span className="font-semibold text-ink">{result.total.toLocaleString("en-GB")}</span> {result.total === 1 ? "vehicle" : "vehicles"} available</p>
              <div className="flex flex-wrap items-center gap-2">
                <SaveSearchButton filters={filters} signedIn={!!session} suggestedName={heading} />
                <SortSelect filters={filters} />
              </div>
            </div>
            <ActiveFilterChips filters={filters} />
          </div>
          {result.error ? <Alert tone="danger" title="Search unavailable">{result.error}</Alert> : null}
          {result.geocodeFailed ? <Alert tone="warning" className="mb-4">We couldn&apos;t locate that postcode, so distance filtering isn&apos;t applied.</Alert> : null}
          {!result.error && result.items.length === 0 ? (
            <div className="rounded-[var(--radius-md)] border border-line bg-white">
              <EmptyState icon={<SearchX />} title="No vehicles match your search"
                description="Try widening your price or mileage range, removing a filter, or saving this search to be told when a matching car is listed."
                action={<Button asChild variant="secondary"><Link href="/cars">Clear all filters</Link></Button>} />
            </div>
          ) : (
            <VehicleGrid listings={result.items} savedIds={savedIds} signedIn={!!session} />
          )}
          {result.pageCount > 1 ? (
            <nav className="mt-10 flex items-center justify-between border-t border-line pt-6" aria-label="Pagination">
              {page > 1 ? <Button asChild variant="secondary"><Link href={pageHref(page - 1)} rel="prev"><ChevronLeft /> Previous</Link></Button> : <span />}
              <p className="text-[13px] text-muted">Page {page} of {result.pageCount}</p>
              {page < result.pageCount ? <Button asChild variant="secondary"><Link href={pageHref(page + 1)} rel="next">Next <ChevronRight /></Link></Button> : <span />}
            </nav>
          ) : null}
        </section>
      </div>
    </div>
  );
}
