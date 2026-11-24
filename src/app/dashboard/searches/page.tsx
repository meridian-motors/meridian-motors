import Link from "next/link";
import { Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { deleteSavedSearch, toggleSearchAlerts } from "@/app/actions/buyer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ActionButton } from "@/components/dashboard/small-actions";
import { filtersToQuery } from "@/lib/search/filters";
import { formatDate } from "@/lib/format";
import type { MarketplaceFilters } from "@/lib/types";

export const metadata = { title: "Saved searches" };

export default async function SavedSearchesPage() {
  await requireUser("/dashboard/searches");
  const supabase = await createClient();
  const { data } = await supabase.from("saved_searches").select("*").order("created_at", { ascending: false });
  return (
    <>
      <PageHeader eyebrow="Buying" title="Saved searches" description="Save a search from the marketplace to return to it, with optional email alerts." />
      <Card>
        {!data?.length ? <EmptyState icon={<Search />} title="No saved searches" action={<Button asChild><Link href="/cars">Search the marketplace</Link></Button>} /> : (
          <ul className="divide-y divide-line">
            {data.map((s) => {
              const q = filtersToQuery(s.filters as MarketplaceFilters);
              return (
                <li key={s.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <Link href={`/cars?${q}`} className="font-medium text-ink hover:underline">{s.name}</Link>
                    <p className="truncate text-[12.5px] text-muted">{decodeURIComponent(q).replace(/&/g, " · ") || "All vehicles"} · saved {formatDate(s.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.alerts_enabled ? <Badge tone="success">Alerts on</Badge> : <Badge>Alerts off</Badge>}
                    <ActionButton size="sm" variant="secondary" action={toggleSearchAlerts.bind(null, s.id, !s.alerts_enabled)}>{s.alerts_enabled ? "Turn off" : "Turn on"} alerts</ActionButton>
                    <ActionButton size="sm" variant="ghost" action={deleteSavedSearch.bind(null, s.id)} confirmText="Delete this saved search?">Delete</ActionButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
