import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { completeSale, markSaleFellThrough } from "@/app/actions/admin";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { SimpleAction } from "@/components/admin/controls";
import { PIPELINE_ORDER, VEHICLE_STATUS_META } from "@/lib/constants";
import { formatDate, formatPrice, timeAgo, vehicleName } from "@/lib/format";
import type { VehicleStatus } from "@/lib/types";

export const metadata = { title: "Sales pipeline" };
const ACTIVE = PIPELINE_ORDER.filter((s) => !["withdrawn", "rejected", "cancelled", "completed"].includes(s));

export default async function SalesPipeline() {
  await requireStaff();
  const supabase = await createClient();
  const [{ data: vehicles }, { data: tx }, { data: counts }] = await Promise.all([
    supabase.from("vehicles").select("id, make, model, year, vehicle_status, updated_at, listings(asking_price)").in("vehicle_status", ACTIVE).is("deleted_at", null).is("archived_at", null).order("updated_at", { ascending: false }).limit(500),
    supabase.from("transactions").select("*, vehicles(make, model, year)").order("created_at", { ascending: false }).limit(100),
    supabase.from("vehicles").select("vehicle_status").in("vehicle_status", ["completed", "withdrawn", "rejected", "cancelled"]).is("deleted_at", null),
  ]);
  const closed = Object.fromEntries(["completed", "withdrawn", "rejected", "cancelled"].map((s) => [s, (counts ?? []).filter((c) => c.vehicle_status === s).length]));
  return (
    <>
      <PageHeader eyebrow="Operations" title="Sales pipeline" description="Every active vehicle by stage. Open a vehicle to move it through the pipeline — each change is recorded with user, timestamp, reason and notes."
        actions={<div className="flex flex-wrap gap-2 text-[12.5px]">{Object.entries(closed).map(([k, n]) => <Badge key={k} tone="outline">{VEHICLE_STATUS_META[k as VehicleStatus].label}: {n}</Badge>)}</div>} />
      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
        <div className="flex gap-3">{ACTIVE.map((s) => { const col = (vehicles ?? []).filter((v) => v.vehicle_status === s);
          return <div key={s} className="w-60 shrink-0 rounded-[var(--radius-md)] border border-line bg-white">
            <div className="flex items-center justify-between border-b border-line px-3 py-2.5"><p className="text-[12px] font-semibold">{VEHICLE_STATUS_META[s].stage}. {VEHICLE_STATUS_META[s].label}</p><span className="text-[11px] text-muted">{col.length}</span></div>
            <ul className="max-h-[420px] space-y-2 overflow-y-auto p-2">{col.map((v) => <li key={v.id}><Link href={`/admin/inventory/${v.id}`} className="block rounded-[var(--radius-sm)] border border-line p-2.5 text-[12.5px] hover:border-silver">
              <p className="font-medium text-ink">{vehicleName(v)}</p><p className="text-muted">{formatPrice((v.listings as { asking_price: number | null }[])?.[0]?.asking_price)} · {timeAgo(v.updated_at)}</p></Link></li>)}
              {!col.length ? <li className="px-1 py-3 text-center text-[11.5px] text-muted">Empty</li> : null}</ul></div>; })}</div>
      </div>
      <Card className="mt-6"><CardHeader title="Transactions" description="Success fees become payable only when a sale is completed (seller and Meridian confirmation)." />
        <Table><THead><tr><TH>Vehicle</TH><TH>Agreed</TH><TH>Status</TH><TH>Seller confirmed</TH><TH>Completed</TH><TH>Fee</TH><TH /></tr></THead><TBody>
          {(tx ?? []).map((t) => <TR key={t.id}><TD><Link className="font-medium hover:underline" href={`/admin/inventory/${t.vehicle_id}`}>{vehicleName(t.vehicles as { make: string; model: string; year: number })}</Link></TD><TD>{formatPrice(t.agreed_price)}</TD>
            <TD><Badge tone={t.sale_status === "completed" ? "dark" : ["fell_through", "cancelled"].includes(t.sale_status) ? "neutral" : "warning"}>{t.sale_status.replace(/_/g, " ")}</Badge></TD><TD>{t.seller_confirmed_at ? formatDate(t.seller_confirmed_at) : "—"}</TD><TD>{formatDate(t.completed_at)}</TD><TD>{t.fee_amount != null ? formatPrice(t.fee_amount) : "—"}</TD>
            <TD>{!["completed", "fell_through", "cancelled"].includes(t.sale_status) ? <div className="flex gap-1">{t.seller_confirmed_at ? <SimpleAction label="Complete" variant="primary" action={completeSale.bind(null, t.id)} confirmText="Confirm handover complete? This raises the success fee." /> : null}<SimpleAction label="Fell through" variant="ghost" action={markSaleFellThrough.bind(null, t.id)} /></div> : null}</TD></TR>)}
        </TBody></Table></Card>
    </>
  );
}
