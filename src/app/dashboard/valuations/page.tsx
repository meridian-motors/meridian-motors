import Link from "next/link";
import { LineChart } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatPercent, formatPrice, vehicleName } from "@/lib/format";

export const metadata = { title: "Valuations" };

export default async function ValuationsPage() {
  const session = await requireUser();
  const supabase = await createClient();
  const { data } = session.sellerId
    ? await supabase.from("valuations").select("id, vehicle_id, market_value_min, market_value_max, recommended_asking_price, fast_sale_price, confidence_score, valuation_status, comparable_count, created_at, vehicles!inner(make, model, year, owner_id)")
        .eq("vehicles.owner_id", session.sellerId).neq("valuation_status", "pending").order("created_at", { ascending: false }).limit(100)
    : { data: [] };
  return (
    <>
      <PageHeader eyebrow="Selling" title="Valuations" description="Every valuation produced for your vehicles, including superseded ones." />
      <Card>
        {!data?.length ? <EmptyState icon={<LineChart />} title="No valuations yet" description="Valuations are produced during your vehicle submission." action={<Button asChild><Link href="/dashboard/vehicles/new">Sell a vehicle</Link></Button>} /> : (
          <Table>
            <THead><tr><TH>Vehicle</TH><TH>Date</TH><TH>Market range</TH><TH>Suggested</TH><TH>Fast sale</TH><TH>Confidence</TH><TH>Status</TH></tr></THead>
            <TBody>
              {data.map((v) => {
                const veh = (Array.isArray(v.vehicles) ? v.vehicles[0] : v.vehicles) as { make: string; model: string; year: number };
                return (
                  <TR key={v.id}>
                    <TD><Link href={`/dashboard/vehicles/${v.vehicle_id}#pricing`} className="font-medium text-ink hover:underline">{vehicleName(veh)}</Link></TD>
                    <TD>{formatDate(v.created_at)}</TD>
                    <TD>{v.market_value_min ? `${formatPrice(v.market_value_min)} – ${formatPrice(v.market_value_max)}` : "—"}</TD>
                    <TD>{formatPrice(v.recommended_asking_price)}</TD>
                    <TD>{formatPrice(v.fast_sale_price)}</TD>
                    <TD>{formatPercent(v.confidence_score)}</TD>
                    <TD><Badge tone={v.valuation_status === "completed" ? "success" : v.valuation_status === "insufficient_data" ? "warning" : "neutral"}>{v.valuation_status.replace("_", " ")}</Badge></TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
