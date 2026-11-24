import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime, formatPercent, formatPrice, vehicleName } from "@/lib/format";

export const metadata = { title: "Valuations" };

export default async function AdminValuations() {
  await requireStaff();
  const supabase = await createClient();
  const { data } = await supabase.from("valuations").select("*, vehicles(id, make, model, year)").neq("valuation_status", "pending").order("created_at", { ascending: false }).limit(200);
  const all = data ?? [];
  const completed = all.filter((v) => ["completed", "superseded"].includes(v.valuation_status) && v.recommended_asking_price);
  return (
    <>
      <PageHeader eyebrow="Intelligence" title="Valuations" description="Every valuation, its evidence count and confidence. Insufficient-data results produce no prices by design." />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Valuations run" value={all.length} /><StatCard label="Completed" value={completed.length} />
        <StatCard label="Insufficient data" value={all.filter((v) => v.valuation_status === "insufficient_data").length} />
        <StatCard label="Avg confidence" value={completed.length ? formatPercent(completed.reduce((s, v) => s + Number(v.confidence_score), 0) / completed.length) : "—"} />
      </div>
      <Card><Table><THead><tr><TH>Vehicle</TH><TH>Date</TH><TH>Range</TH><TH>Asking</TH><TH>Fast sale</TH><TH>Comps</TH><TH>Confidence</TH><TH>Explanation</TH><TH>Status</TH></tr></THead><TBody>
        {all.map((v) => { const veh = v.vehicles as { id: string; make: string; model: string; year: number };
          return <TR key={v.id}><TD><Link href={`/admin/inventory/${veh.id}#pricing`} className="font-medium hover:underline">{vehicleName(veh)}</Link></TD><TD className="whitespace-nowrap">{formatDateTime(v.created_at)}</TD>
            <TD>{v.market_value_min ? `${formatPrice(v.market_value_min)}–${formatPrice(v.market_value_max)}` : "—"}</TD><TD>{formatPrice(v.recommended_asking_price)}</TD><TD>{formatPrice(v.fast_sale_price)}</TD><TD>{v.comparable_count}</TD>
            <TD>{formatPercent(v.confidence_score)}</TD><TD><Badge>{v.explanation_source}</Badge></TD><TD><Badge tone={v.valuation_status === "completed" ? "success" : v.valuation_status === "insufficient_data" ? "warning" : "neutral"}>{v.valuation_status.replace("_", " ")}</Badge></TD></TR>; })}
      </TBody></Table></Card>
    </>
  );
}
