import Link from "next/link";
import { Handshake } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { VehicleStatusBadge } from "@/components/dashboard/status";
import { formatDate, formatPrice, vehicleName } from "@/lib/format";
import type { VehicleStatus } from "@/lib/types";

export const metadata = { title: "Sales" };

const SALE_LABEL: Record<string, string> = { pending_confirmation: "Awaiting Meridian confirmation", agreed: "Agreed", payment_pending: "Payment pending", handover_pending: "Handover pending", completed: "Completed", fell_through: "Fell through", cancelled: "Cancelled" };

export default async function SalesPage() {
  const session = await requireUser();
  const supabase = await createClient();
  const [{ data: tx }, { data: inProgress }] = await Promise.all([
    supabase.from("transactions").select("id, vehicle_id, agreed_price, sale_status, fee_amount, completed_at, created_at, vehicles(make, model, year)").eq("seller_id", session.sellerId ?? "").order("created_at", { ascending: false }),
    supabase.from("vehicles").select("id, make, model, year, vehicle_status").eq("owner_id", session.sellerId ?? "").in("vehicle_status", ["offer_received", "sale_agreed", "payment_pending", "handover_pending"]),
  ]);
  return (
    <>
      <PageHeader eyebrow="Selling" title="Sales" description="Sales in progress and completed sales. A success fee becomes payable only once a sale is completed." />
      {inProgress?.length ? (
        <Card className="mb-6"><Table><THead><tr><TH>Vehicle in progress</TH><TH>Stage</TH></tr></THead><TBody>
          {inProgress.map((v) => <TR key={v.id}><TD><Link href={`/dashboard/vehicles/${v.id}`} className="font-medium hover:underline">{vehicleName(v)}</Link></TD><TD><VehicleStatusBadge status={v.vehicle_status as VehicleStatus} /></TD></TR>)}
        </TBody></Table></Card>
      ) : null}
      <Card>
        {!tx?.length ? <EmptyState icon={<Handshake />} title="No sales recorded yet" description="When you agree a sale, report it from the vehicle page and Meridian will confirm it with you." /> : (
          <Table>
            <THead><tr><TH>Vehicle</TH><TH>Agreed price</TH><TH>Status</TH><TH>Completed</TH><TH className="text-right">Meridian fee</TH></tr></THead>
            <TBody>{tx.map((t) => {
              const v = (Array.isArray(t.vehicles) ? t.vehicles[0] : t.vehicles) as { make: string; model: string; year: number };
              return <TR key={t.id}><TD><Link href={`/dashboard/vehicles/${t.vehicle_id}`} className="font-medium hover:underline">{vehicleName(v)}</Link></TD><TD>{formatPrice(t.agreed_price)}</TD>
                <TD><Badge tone={t.sale_status === "completed" ? "dark" : "warning"}>{SALE_LABEL[t.sale_status]}</Badge></TD><TD>{formatDate(t.completed_at)}</TD><TD className="text-right">{t.fee_amount != null ? formatPrice(t.fee_amount) : "—"}</TD></TR>;
            })}</TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
