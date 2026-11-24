import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EnquiryStatusBadge } from "@/components/dashboard/status";
import { ENQUIRY_TYPE_LABELS } from "@/lib/constants";
import { timeAgo, vehicleName } from "@/lib/format";
import type { EnquiryStatus, EnquiryType } from "@/lib/types";

export const metadata = { title: "My enquiries" };

export default async function BuyerEnquiriesPage() {
  const session = await requireUser("/dashboard/buying");
  const supabase = await createClient();
  const { data } = session.buyerId ? await supabase.from("enquiries").select("id, enquiry_type, enquiry_status, created_at, updated_at, vehicles(make, model, year)").eq("buyer_id", session.buyerId).order("updated_at", { ascending: false }) : { data: [] };
  return (
    <>
      <PageHeader eyebrow="Buying" title="My enquiries" description="Conversations about vehicles you're interested in." />
      <Card>
        {!data?.length ? <EmptyState icon={<MessageSquare />} title="No enquiries yet" action={<Button asChild><Link href="/cars">Find a vehicle</Link></Button>} /> : (
          <Table><THead><tr><TH>Vehicle</TH><TH>Type</TH><TH>Last update</TH><TH>Status</TH></tr></THead><TBody>
            {data.map((e) => {
              const v = (Array.isArray(e.vehicles) ? e.vehicles[0] : e.vehicles) as { make: string; model: string; year: number };
              return <TR key={e.id}><TD><Link href={`/dashboard/enquiries/${e.id}`} className="font-medium hover:underline">{vehicleName(v)}</Link></TD><TD>{ENQUIRY_TYPE_LABELS[e.enquiry_type as EnquiryType]}</TD><TD>{timeAgo(e.updated_at)}</TD><TD><EnquiryStatusBadge status={e.enquiry_status as EnquiryStatus} /></TD></TR>;
            })}
          </TBody></Table>
        )}
      </Card>
    </>
  );
}
