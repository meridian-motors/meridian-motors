import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { VehicleStatusBadge } from "@/components/dashboard/status";
import { formatPrice, timeAgo, vehicleName } from "@/lib/format";
import type { VehicleStatus } from "@/lib/types";

export const metadata = { title: "Listing approval" };

const QUEUES: { title: string; description: string; statuses: VehicleStatus[]; filter?: (l: { seller_approved_at: string | null; admin_approved_at: string | null }) => boolean }[] = [
  { title: "New submissions", description: "Submitted by sellers — begin verification.", statuses: ["submitted"] },
  { title: "In verification", description: "Verification in progress or information requested.", statuses: ["verification_pending", "awaiting_information"] },
  { title: "Valuation stage", description: "Valued — send to the seller for pricing approval.", statuses: ["valuation_completed", "awaiting_seller_approval"] },
  { title: "Ready for Meridian approval / publication", description: "Seller has approved; review and publish.", statuses: ["approved_for_publication", "awaiting_seller_approval", "verification_pending", "valuation_completed", "submitted"], filter: (l) => !!l.seller_approved_at },
];

export default async function ListingsQueue() {
  await requireStaff();
  const supabase = await createClient();
  const { data } = await supabase.from("vehicles").select("id, make, model, year, vehicle_status, submitted_at, updated_at, is_flagged, vehicle_images(count), listings(asking_price, seller_approved_at, admin_approved_at)")
    .in("vehicle_status", ["submitted", "verification_pending", "awaiting_information", "valuation_completed", "awaiting_seller_approval", "approved_for_publication"]).is("deleted_at", null).order("submitted_at", { ascending: true });
  return (
    <>
      <PageHeader eyebrow="Operations" title="Listing approval" description="Every listing passes through this queue before it can appear publicly." />
      <div className="space-y-6">
        {QUEUES.map((q) => {
          const rows = (data ?? []).filter((v) => {
            const l = (v.listings as { seller_approved_at: string | null; admin_approved_at: string | null }[])?.[0] ?? { seller_approved_at: null, admin_approved_at: null };
            return q.statuses.includes(v.vehicle_status as VehicleStatus) && (q.filter ? q.filter(l) : !l.seller_approved_at || q.statuses.includes("awaiting_information"));
          });
          return (
            <Card key={q.title}>
              <CardHeader title={`${q.title} (${rows.length})`} description={q.description} />
              {!rows.length ? <EmptyState icon={<ClipboardCheck />} title="Queue clear" className="py-8" /> : (
                <Table><THead><tr><TH>Vehicle</TH><TH>Status</TH><TH>Photos</TH><TH>Price</TH><TH>Seller approved</TH><TH>Meridian approved</TH><TH>Waiting</TH></tr></THead><TBody>
                  {rows.map((v) => { const l = (v.listings as { asking_price: number | null; seller_approved_at: string | null; admin_approved_at: string | null }[])?.[0];
                    return <TR key={v.id}><TD><Link href={`/admin/inventory/${v.id}`} className="font-medium hover:underline">{vehicleName(v)}</Link>{v.is_flagged ? <Badge tone="danger" className="ml-2">Flagged</Badge> : null}</TD>
                      <TD><VehicleStatusBadge status={v.vehicle_status as VehicleStatus} /></TD><TD>{(v.vehicle_images as { count: number }[])?.[0]?.count ?? 0}</TD><TD>{formatPrice(l?.asking_price)}</TD>
                      <TD>{l?.seller_approved_at ? <Badge tone="success">Yes</Badge> : <Badge>No</Badge>}</TD><TD>{l?.admin_approved_at ? <Badge tone="success">Yes</Badge> : <Badge>No</Badge>}</TD><TD>{timeAgo(v.submitted_at ?? v.updated_at)}</TD></TR>; })}
                </TBody></Table>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
