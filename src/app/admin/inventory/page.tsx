import Link from "next/link";
import { Plus } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { VehicleStatusBadge } from "@/components/dashboard/status";
import { VEHICLE_STATUS_META } from "@/lib/constants";
import { formatMileage, formatPrice, timeAgo, vehicleName } from "@/lib/format";
import type { VehicleStatus } from "@/lib/types";

export const metadata = { title: "Inventory" };
const PAGE = 50;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireStaff();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();
  let q = supabase.from("vehicles").select("id, registration_number, make, model, year, mileage, vehicle_status, source, is_flagged, archived_at, updated_at, listings(asking_price, listing_status)", { count: "exact" }).is("deleted_at", null);
  if (sp.status) q = q.eq("vehicle_status", sp.status);
  if (sp.flagged) q = q.eq("is_flagged", true);
  if (sp.source) q = q.eq("source", sp.source);
  if (!sp.archived) q = q.is("archived_at", null);
  if (sp.q) {
    const term = sp.q.replace(/[,()%]/g, " ").trim();
    q = q.or(`make.ilike.%${term}%,model.ilike.%${term}%,registration_number.ilike.%${term.replace(/\s/g, "").toUpperCase()}%`);
  }
  const { data, count } = await q.order("updated_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  const pages = Math.ceil((count ?? 0) / PAGE);
  const qs = (p: number) => new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>, page: String(p) }).toString();
  return (
    <>
      <PageHeader eyebrow="Operations" title="Inventory" description={`${count ?? 0} vehicles`} actions={<><Button asChild variant="secondary"><Link href="/admin/imports">Import</Link></Button><Button asChild><Link href="/admin/inventory/new"><Plus />Add vehicle</Link></Button></>} />
      <form className="mb-5 grid gap-2 sm:grid-cols-[1fr_220px_160px_auto_auto]">
        <Input name="q" defaultValue={sp.q} placeholder="Search make, model or registration" aria-label="Search" />
        <Select name="status" defaultValue={sp.status ?? ""} aria-label="Status"><option value="">All statuses</option>{Object.entries(VEHICLE_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
        <Select name="source" defaultValue={sp.source ?? ""} aria-label="Source"><option value="">All sources</option><option value="seller_submission">Seller</option><option value="admin_manual">Manual</option><option value="import">Import</option></Select>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="flagged" value="1" defaultChecked={!!sp.flagged} className="accent-ink" />Flagged</label>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <Card>
        {!data?.length ? <EmptyState title="No vehicles found" /> : (
          <Table><THead><tr><TH>Vehicle</TH><TH>Reg</TH><TH>Mileage</TH><TH>Price</TH><TH>Status</TH><TH>Source</TH><TH>Updated</TH></tr></THead><TBody>
            {data.map((v) => {
              const l = (v.listings as { asking_price: number | null }[] | null)?.[0];
              return <TR key={v.id}><TD><Link href={`/admin/inventory/${v.id}`} className="font-medium text-ink hover:underline">{vehicleName(v)}</Link>{v.is_flagged ? <Badge tone="danger" className="ml-2">Flagged</Badge> : null}{v.archived_at ? <Badge className="ml-2">Archived</Badge> : null}</TD>
                <TD className="font-mono text-[12.5px]">{v.registration_number ?? "—"}</TD><TD>{formatMileage(v.mileage)}</TD><TD>{formatPrice(l?.asking_price)}</TD>
                <TD><VehicleStatusBadge status={v.vehicle_status as VehicleStatus} /></TD><TD className="text-[12.5px] text-muted">{v.source.replace("_", " ")}</TD><TD className="whitespace-nowrap">{timeAgo(v.updated_at)}</TD></TR>;
            })}
          </TBody></Table>
        )}
      </Card>
      {pages > 1 ? <div className="mt-4 flex justify-between text-[13px]">{page > 1 ? <Link href={`?${qs(page - 1)}`}>← Previous</Link> : <span />}<span className="text-muted">Page {page} of {pages}</span>{page < pages ? <Link href={`?${qs(page + 1)}`}>Next →</Link> : <span />}</div> : null}
    </>
  );
}
