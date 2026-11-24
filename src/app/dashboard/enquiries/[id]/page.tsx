import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sellerUpdateEnquiry } from "@/app/actions/seller";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DefinitionList, PageHeader } from "@/components/ui/misc";
import { ConversationThread } from "@/components/dashboard/conversation";
import { EnquiryStatusBadge } from "@/components/dashboard/status";
import { ActionButton } from "@/components/dashboard/small-actions";
import { ENQUIRY_TYPE_LABELS } from "@/lib/constants";
import { formatDateTime, formatPrice, vehicleName } from "@/lib/format";
import type { EnquiryStatus, EnquiryType, Message } from "@/lib/types";

export const metadata = { title: "Enquiry" };

export default async function EnquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireUser(`/dashboard/enquiries/${id}`);
  const supabase = await createClient();
  const { data: e } = await supabase.from("enquiries").select("*, vehicles(id, make, model, year), listings(slug, title), conversations(id)").eq("id", id).maybeSingle();
  if (!e) notFound();
  const isSeller = e.seller_id && e.seller_id === session.sellerId;
  const conversation = (Array.isArray(e.conversations) ? e.conversations[0] : e.conversations) as { id: string } | null;
  const { data: messages } = conversation ? await supabase.from("messages").select("*").eq("conversation_id", conversation.id).order("created_at") : { data: [] };
  // Mark incoming messages read
  if (conversation) await supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("conversation_id", conversation.id).is("read_at", null).neq("sender_id", session.userId);
  if (isSeller && e.enquiry_status === "new") await supabase.from("enquiries").update({ enquiry_status: "in_progress" }).eq("id", id);
  const v = (Array.isArray(e.vehicles) ? e.vehicles[0] : e.vehicles) as { id: string; make: string; model: string; year: number };
  const l = (Array.isArray(e.listings) ? e.listings[0] : e.listings) as { slug: string } | null;

  return (
    <>
      <PageHeader eyebrow={isSeller ? "Enquiry about your vehicle" : "Your enquiry"} title={vehicleName(v)}
        description={<span className="inline-flex items-center gap-2"><EnquiryStatusBadge status={e.enquiry_status as EnquiryStatus} />{ENQUIRY_TYPE_LABELS[e.enquiry_type as EnquiryType]}</span>} />
      <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <Card><CardHeader title="Conversation" /><CardBody>
          {conversation ? <ConversationThread conversationId={conversation.id} messages={(messages ?? []) as Message[]} viewerRole={isSeller ? "seller" : "buyer"} buyerName={e.buyer_display_name}
            canReply={!["closed_won", "closed_lost", "spam"].includes(e.enquiry_status) && (isSeller || !!e.buyer_id)} /> : null}
        </CardBody></Card>
        <div className="space-y-6">
          <Card><CardHeader title="Details" /><CardBody>
            <DefinitionList className="!grid-cols-1" items={[
              { label: isSeller ? "Buyer" : "Seller", value: isSeller ? e.buyer_display_name ?? "Buyer" : "Private seller" },
              { label: "Received", value: formatDateTime(e.created_at) },
              { label: "Offer", value: e.offer_amount ? formatPrice(e.offer_amount) : null },
            ]} />
            {l ? <Link href={`/cars/${l.slug}`} className="mt-4 inline-block text-[13px] underline">View listing</Link> : null}
          </CardBody></Card>
          {isSeller ? (
            <Card><CardHeader title="Manage" description="Meridian coordinates viewings and offers with you." /><CardBody className="flex flex-wrap gap-2">
              <ActionButton size="sm" variant="secondary" action={sellerUpdateEnquiry.bind(null, id, "awaiting_buyer")}>Awaiting buyer</ActionButton>
              <ActionButton size="sm" variant="secondary" action={sellerUpdateEnquiry.bind(null, id, "closed_lost")}>Close</ActionButton>
              <ActionButton size="sm" variant="ghost" className="text-danger" action={sellerUpdateEnquiry.bind(null, id, "spam")} confirmText="Mark this enquiry as spam?">Report spam</ActionButton>
            </CardBody></Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
