import Link from "next/link";
import { AlertTriangle, Car, ClipboardCheck, Coins, Gauge, MessageSquare, Timer, Trophy, Users } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { integrationStatus } from "@/lib/env";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { VehicleStatusBadge } from "@/components/dashboard/status";
import { formatNumber, formatPence, formatPercent, formatPrice, timeAgo, vehicleName } from "@/lib/format";
import type { VehicleStatus } from "@/lib/types";

export const metadata = { title: "Overview" };

type S = Record<string, number | null>;

export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireStaff();
  const days = [7, 30, 90, 365].includes(Number((await searchParams).days)) ? Number((await searchParams).days) : 30;
  const supabase = await createClient();
  const from = new Date(Date.now() - days * 86400000).toISOString();
  const [{ data }, { data: recent }] = await Promise.all([
    supabase.rpc("admin_dashboard_stats", { p_from: from, p_to: new Date().toISOString() }),
    supabase.from("vehicles").select("id, make, model, year, vehicle_status, updated_at, is_flagged").is("deleted_at", null).neq("vehicle_status", "draft").order("updated_at", { ascending: false }).limit(8),
  ]);
  const s = (data ?? {}) as S;
  const integ = integrationStatus();
  const missing = Object.entries(integ).filter(([, v]) => !v).map(([k]) => k);
  const runRate = s.period_revenue_pence != null ? Math.round((s.period_revenue_pence / days) * 30) : null;

  return (
    <>
      <PageHeader eyebrow="Meridian operations" title="Overview" description="Actual recorded platform data. Estimates are labelled separately."
        actions={<div className="flex rounded-[var(--radius-sm)] border border-line bg-white p-0.5">{[7, 30, 90, 365].map((d) => (
          <Link key={d} href={`/admin?days=${d}`} className={`rounded-[3px] px-3 py-1.5 text-[12.5px] ${d === days ? "bg-ink text-white" : "text-slate hover:text-ink"}`}>{d === 365 ? "12m" : `${d}d`}</Link>))}</div>} />
      {missing.length ? <Alert tone="warning" className="mb-6" title="Integrations awaiting configuration">{missing.join(", ").replace("supabase_admin", "Supabase service role")} — these features show an unavailable state until credentials are added. See Settings.</Alert> : null}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Registered users" value={formatNumber(s.total_users)} icon={<Users />} hint={`${formatNumber(s.new_users)} new · ${formatNumber(s.total_sellers)} sellers · ${formatNumber(s.total_buyers)} buyers`} />
        <StatCard label="Active listings" value={formatNumber(s.active_listings)} icon={<Car />} hint={`${formatNumber(s.total_vehicles)} vehicles in total`} />
        <StatCard label="Pending review" value={formatNumber(s.pending_listings)} icon={<ClipboardCheck />} tone="accent" hint={`${formatNumber(s.awaiting_review)} awaiting Meridian approval · ${formatNumber(s.rejected_listings)} rejected`} />
        <StatCard label="Enquiries" value={formatNumber(s.total_enquiries)} icon={<MessageSquare />} hint={`${formatNumber(s.period_enquiries)} this period · ${formatNumber(s.open_enquiries)} open`} />
        <StatCard label="Sales" value={formatNumber(s.completed_sales)} icon={<Trophy />} hint={`${formatNumber(s.sales_in_progress)} in progress · ${formatNumber(s.period_completed_sales)} this period`} />
        <StatCard label="Revenue (received)" value={formatPence(s.total_revenue_pence)} icon={<Coins />} hint={`${formatPence(s.period_revenue_pence)} this period · ${formatPence(s.outstanding_payments_pence)} outstanding`} />
        <StatCard label="Average price" value={formatPrice(s.average_listing_price)} icon={<Gauge />} hint={`Listings · sold average ${formatPrice(s.average_sale_price)}`} />
        <StatCard label="Average time to sale" value={s.average_days_to_sale != null ? `${s.average_days_to_sale} days` : "—"} icon={<Timer />}
          hint={`Listing→sale ${formatPercent(s.listing_to_sale_conversion, 1)} · enquiry→sale ${formatPercent(s.enquiry_to_sale_conversion, 1)}`} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Card className="p-5"><p className="eyebrow">AI usage ({days}d)</p><p className="mt-2 text-xl font-semibold">{formatNumber(s.ai_runs)} runs · ${Number(s.ai_cost_usd ?? 0).toFixed(2)}</p><p className="text-[12.5px] text-muted">Error rate {formatPercent(s.ai_error_rate, 1)}</p></Card>
        <Card className="p-5"><p className="eyebrow">Flagged vehicles</p><p className="mt-2 flex items-center gap-2 text-xl font-semibold">{formatNumber(s.flagged_vehicles)}{s.flagged_vehicles ? <AlertTriangle className="size-4 text-danger" /> : null}</p><p className="text-[12.5px] text-muted">Suspicious submissions for review</p></Card>
        <Card className="border-dashed p-5"><p className="eyebrow">Estimate — revenue run-rate</p><p className="mt-2 text-xl font-semibold">{runRate != null ? `${formatPence(runRate)} / 30 days` : "—"}</p><p className="text-[12.5px] text-muted">Projection from the last {days} days of actual revenue. Not a forecast of future performance.</p></Card>
      </div>
      <Card className="mt-8">
        <CardHeader title="Recent vehicle activity" action={<Link href="/admin/inventory" className="text-[13px] underline">Inventory</Link>} />
        <Table><THead><tr><TH>Vehicle</TH><TH>Status</TH><TH>Updated</TH></tr></THead><TBody>
          {(recent ?? []).map((v) => <TR key={v.id}><TD><Link href={`/admin/inventory/${v.id}`} className="font-medium hover:underline">{vehicleName(v)}</Link>{v.is_flagged ? <Badge tone="danger" className="ml-2">Flagged</Badge> : null}</TD><TD><VehicleStatusBadge status={v.vehicle_status as VehicleStatus} /></TD><TD>{timeAgo(v.updated_at)}</TD></TR>)}
        </TBody></Table>
      </Card>
    </>
  );
}
