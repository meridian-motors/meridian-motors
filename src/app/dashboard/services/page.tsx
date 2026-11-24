import { Wrench } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cancelServiceOrder } from "@/app/actions/seller";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionButton } from "@/components/dashboard/small-actions";
import { ServiceOrderForm } from "@/components/dashboard/service-order-form";
import { formatDate, formatPrice, vehicleName } from "@/lib/format";

export const metadata = { title: "Services" };

export default async function ServicesPage() {
  const session = await requireUser();
  const supabase = await createClient();
  const [{ data: catalog }, { data: orders }, { data: vehicles }] = await Promise.all([
    supabase.from("service_catalog").select("id, code, name, description, price").eq("is_active", true).order("display_order"),
    supabase.from("service_orders").select("id, service_type, service_status, price, notes, created_at, service_catalog(name), vehicles(make, model, year)").eq("seller_id", session.sellerId ?? "").order("created_at", { ascending: false }),
    supabase.from("vehicles").select("id, make, model, year").eq("owner_id", session.sellerId ?? "").is("deleted_at", null).not("vehicle_status", "in", "(completed,cancelled,rejected)"),
  ]);
  return (
    <>
      <PageHeader eyebrow="Selling" title="Assisted-selling services" description="Optional extra help. We confirm details with you before any payment is taken." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(catalog ?? []).map((s) => (
          <Card key={s.id} className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-3"><p className="font-semibold text-ink">{s.name}</p><p className="font-semibold">{formatPrice(s.price)}</p></div>
            <p className="mt-2 flex-1 text-[13.5px] leading-relaxed text-muted">{s.description}</p>
            <div className="mt-4"><ServiceOrderForm serviceId={s.id} serviceName={s.name} vehicles={(vehicles ?? []).map((v) => ({ id: v.id, name: vehicleName(v) }))} /></div>
          </Card>
        ))}
      </div>
      <Card className="mt-8">
        <CardHeader title="Your service requests" />
        {!orders?.length ? <CardBody><EmptyState icon={<Wrench />} title="No services requested" className="py-8" /></CardBody> : (
          <Table>
            <THead><tr><TH>Service</TH><TH>Vehicle</TH><TH>Requested</TH><TH>Price</TH><TH>Status</TH><TH /></tr></THead>
            <TBody>{orders.map((o) => {
              const sc = (Array.isArray(o.service_catalog) ? o.service_catalog[0] : o.service_catalog) as { name: string } | null;
              const v = (Array.isArray(o.vehicles) ? o.vehicles[0] : o.vehicles) as { make: string; model: string; year: number } | null;
              return <TR key={o.id}><TD className="font-medium">{sc?.name ?? o.service_type}</TD><TD>{v ? vehicleName(v) : "—"}</TD><TD>{formatDate(o.created_at)}</TD><TD>{formatPrice(o.price)}</TD>
                <TD><Badge tone={o.service_status === "completed" ? "success" : o.service_status === "cancelled" ? "neutral" : "info"}>{o.service_status.replace("_", " ")}</Badge></TD>
                <TD className="text-right">{["requested", "quoted", "awaiting_payment"].includes(o.service_status) ? <ActionButton size="sm" variant="ghost" action={cancelServiceOrder.bind(null, o.id)} confirmText="Cancel this request?">Cancel</ActionButton> : null}</TD></TR>;
            })}</TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
