import { requireStaff, isAdminRole, displayName } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ServiceForm, ServiceOrderControls } from "@/components/admin/controls";
import { formatDate, formatPrice } from "@/lib/format";

export const metadata = { title: "Services" };

export default async function AdminServices() {
  const session = await requireStaff();
  const supabase = await createClient();
  const [{ data: catalog }, { data: orders }] = await Promise.all([
    supabase.from("service_catalog").select("*").order("display_order"),
    supabase.from("service_orders").select("*, service_catalog(name), sellers(profiles(email, first_name, last_name)), vehicles(make, model, year)").order("created_at", { ascending: false }).limit(200),
  ]);
  const admin = isAdminRole(session.profile.role);
  return (
    <>
      <PageHeader eyebrow="Commercial" title="Assisted-selling services" description="Service prices are configurable here — no code changes needed." />
      {admin ? <Card className="mb-8"><CardHeader title="Service catalogue" /><CardBody className="space-y-3">{(catalog ?? []).map((s) => <ServiceForm key={s.id} service={s} />)}<div className="border-t border-line pt-3"><p className="mb-2 text-[13px] font-medium">Add a service</p><ServiceForm /></div></CardBody></Card> : null}
      <Card><CardHeader title="Service orders" /><Table><THead><tr><TH>Seller</TH><TH>Service</TH><TH>Vehicle</TH><TH>Price</TH><TH>Seller notes</TH><TH>Requested</TH><TH>Manage</TH></tr></THead><TBody>
        {(orders ?? []).map((o) => { const s = (o.sellers as unknown as { profiles: { email: string; first_name: string | null; last_name: string | null } }).profiles; const v = o.vehicles as { make: string; model: string; year: number } | null;
          return <TR key={o.id}><TD className="text-[13px]">{displayName(s)}</TD><TD>{(o.service_catalog as { name: string }).name}</TD><TD>{v ? `${v.year} ${v.make} ${v.model}` : "—"}</TD><TD>{formatPrice(o.price)}</TD><TD className="max-w-[200px] text-[12.5px]">{o.notes}</TD><TD>{formatDate(o.created_at)}</TD>
            <TD className="min-w-[260px]"><ServiceOrderControls orderId={o.id} status={o.service_status} notes={o.staff_notes} /></TD></TR>; })}
      </TBody></Table></Card>
    </>
  );
}
