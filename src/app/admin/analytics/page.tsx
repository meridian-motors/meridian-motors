import Link from "next/link";
import { Download } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BarChart } from "@/components/admin/bar-chart";
import { formatPrice } from "@/lib/format";

export const metadata = { title: "Analytics" };

const METRICS: [string, string, "count" | "gbp" | "usd"][] = [
  ["listing_views", "Listing views", "count"], ["saves", "Vehicles saved", "count"], ["enquiries", "Enquiries", "count"],
  ["new_listings", "New listings published", "count"], ["completed_sales", "Completed sales", "count"], ["revenue", "Revenue received (£)", "gbp"], ["registrations", "New registrations", "count"], ["ai_cost", "AI cost (US$, estimated)", "usd"],
];

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : new Date().toISOString().slice(0, 10);
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const supabase = await createClient();
  const series = await Promise.all(METRICS.map(([m]) => supabase.rpc("admin_timeseries", { p_metric: m, p_from: from, p_to: `${to}T23:59:59Z` })));
  const [{ data: byMake }, { data: byLocation }, { data: withdrawn }] = await Promise.all([
    supabase.from("transactions").select("agreed_price, vehicles(make, body_type, location)").eq("sale_status", "completed").gte("completed_at", from).lte("completed_at", `${to}T23:59:59Z`),
    supabase.from("public_listings").select("location"),
    supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("vehicle_status", "withdrawn"),
  ]);
  const group = <T,>(rows: T[], key: (r: T) => string | null) => Object.entries(rows.reduce<Record<string, number>>((acc, r) => { const k = key(r) ?? "Unknown"; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const sales = (byMake ?? []) as unknown as { agreed_price: number; vehicles: { make: string; body_type: string | null; location: string | null } }[];
  void withdrawn;
  const fmt = (k: string) => (n: number) => k === "gbp" ? `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}` : k === "usd" ? `$${n.toFixed(2)}` : n.toLocaleString("en-GB");
  return (
    <>
      <PageHeader eyebrow="Intelligence" title="Analytics" description="Recorded metrics only — no projections on this page."
        actions={<Button asChild variant="secondary"><Link href={`/api/admin/reports?from=${from}&to=${to}`}><Download />Export CSV</Link></Button>} />
      <form className="mb-6 flex flex-wrap items-end gap-2">
        <label className="text-[13px]">From<input type="date" name="from" defaultValue={from} className="ml-2 h-9 rounded-[var(--radius-sm)] border border-line px-2" /></label>
        <label className="text-[13px]">To<input type="date" name="to" defaultValue={to} className="ml-2 h-9 rounded-[var(--radius-sm)] border border-line px-2" /></label>
        <Button size="sm" type="submit">Apply</Button>
      </form>
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {METRICS.map(([m, title, kind], i) => <BarChart key={m} title={title} format={fmt(kind)} data={((series[i].data ?? []) as { day: string; value: number }[]).map((d) => ({ day: d.day, value: Number(d.value ?? 0) }))} />)}
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card><CardHeader title="Sales by make" /><Table><TBody>{group(sales, (s) => s.vehicles?.make).map(([k, n]) => <TR key={k}><TD>{k}</TD><TD className="text-right">{n}</TD></TR>)}</TBody></Table></Card>
        <Card><CardHeader title="Sales by body type" /><Table><TBody>{group(sales, (s) => s.vehicles?.body_type).map(([k, n]) => <TR key={k}><TD className="capitalize">{k}</TD><TD className="text-right">{n}</TD></TR>)}</TBody></Table></Card>
        <Card><CardHeader title="Sales by location" description={`Average sale price ${formatPrice(sales.length ? Math.round(sales.reduce((s, x) => s + x.agreed_price, 0) / sales.length) : null)}`} /><Table><TBody>{group(sales, (s) => s.vehicles?.location).map(([k, n]) => <TR key={k}><TD>{k}</TD><TD className="text-right">{n}</TD></TR>)}</TBody></Table></Card>
        <Card className="lg:col-span-3"><CardHeader title="Live listings by location" /><Table><THead><tr><TH>Location</TH><TH className="text-right">Listings</TH></tr></THead><TBody>{group((byLocation ?? []) as { location: string | null }[], (l) => l.location).map(([k, n]) => <TR key={k}><TD>{k}</TD><TD className="text-right">{n}</TD></TR>)}</TBody></Table></Card>
      </div>
    </>
  );
}
