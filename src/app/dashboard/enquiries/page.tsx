import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EnquiryStatusBadge } from "@/components/dashboard/status";
import { ENQUIRY_TYPE_LABELS } from "@/lib/constants";
import { formatPrice, timeAgo, vehicleName } from "@/lib/format";
import type { EnquiryStatus, EnquiryType } from "@/lib/types";

export const metadata = { title: "Enquiries" };

export default async function SellerEnquiriesPage() {
  const session = await requireUser();
  const supabase = await createClient();
  const { data } = session.sellerId
    ? await supabase.from("enquiries").select("id, enquiry_type, message, offer_amount, buyer_display_name, enquiry_status, created_at, vehicles(make, model, year)")
        .eq("seller_id", session.sellerId).order("created_at", { ascending: false }).limit(200)
    : { data: [] };
  return (
    <>
      <PageHeader eyebrow="Selling" title="Enquiries" description="Messages from buyers about your vehicles. Buyer contact details are held by Meridian, who coordinate viewings and contact." />
      <Card>
        {!data?.length ? <EmptyState icon={<MessageSquare />} title="No enquiries yet" description="When buyers enquire about your listings they'll appear here." /> : (
          <Table>
            <THead><tr><TH>Buyer</TH><TH>Vehicle</TH><TH>Type</TH><TH>Message</TH><TH>Received</TH><TH>Status</TH></tr></THead>
            <TBody>
              {data.map((e) => {
                const v = (Array.isArray(e.vehicles) ? e.vehicles[0] : e.vehicles) as { make: string; model: string; year: number };
                return (
                  <TR key={e.id}>
                    <TD><Link href={`/dashboard/enquiries/${e.id}`} className="font-medium text-ink hover:underline">{e.buyer_display_name ?? "Buyer"}</Link></TD>
                    <TD>{vehicleName(v)}</TD>
                    <TD>{ENQUIRY_TYPE_LABELS[e.enquiry_type as EnquiryType]}{e.offer_amount ? <span className="block text-[12px] font-medium text-accent-strong">Offer {formatPrice(e.offer_amount)}</span> : null}</TD>
                    <TD className="max-w-xs"><span className="line-clamp-2 text-[13px] text-slate">{e.message}</span></TD>
                    <TD className="whitespace-nowrap">{timeAgo(e.created_at)}</TD>
                    <TD><EnquiryStatusBadge status={e.enquiry_status as EnquiryStatus} /></TD>
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
