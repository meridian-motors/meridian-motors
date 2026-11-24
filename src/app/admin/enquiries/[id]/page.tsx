import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff, displayName } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isAiConfigured } from "@/lib/ai/run";
import { analyseEnquiry, completeActivity } from "@/app/actions/admin";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DefinitionList, PageHeader } from "@/components/ui/misc";
import { ConversationThread } from "@/components/dashboard/conversation";
import { EnquiryControls, ActivityForm, ViewingForm, SimpleAction } from "@/components/admin/controls";
import { ENQUIRY_TYPE_LABELS } from "@/lib/constants";
import { formatDateTime, formatPrice, vehicleName } from "@/lib/format";
import type { EnquiryType, Message } from "@/lib/types";

export const metadata = { title: "Enquiry" };

export default async function AdminEnquiry({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireStaff();
  const supabase = await createClient();
  const { data: e } = await supabase.from("enquiries").select("*, vehicles(id, make, model, year), listings(slug, asking_price), conversations(id), enquiry_contacts(*), sellers(profiles(first_name, last_name, email, phone))").eq("id", id).maybeSingle();
  if (!e) notFound();
  const conv = (Array.isArray(e.conversations) ? e.conversations[0] : e.conversations) as { id: string } | null;
  const [{ data: messages }, { data: activities }, { data: staffList }, { data: viewings }] = await Promise.all([
    conv ? supabase.from("messages").select("*").eq("conversation_id", conv.id).order("created_at") : Promise.resolve({ data: [] }),
    supabase.from("enquiry_activities").select("*, profiles(first_name, last_name, email)").eq("enquiry_id", id).order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, first_name, last_name, email").in("role", ["sales_operator", "admin", "super_admin", "verification_operator"]).eq("account_status", "active"),
    supabase.from("viewings").select("*").eq("enquiry_id", id).order("scheduled_for"),
  ]);
  const v = e.vehicles as unknown as { id: string; make: string; model: string; year: number };
  const contact = (Array.isArray(e.enquiry_contacts) ? e.enquiry_contacts[0] : e.enquiry_contacts) as { full_name: string; email: string; phone: string | null } | null;
  const seller = (e.sellers as unknown as { profiles: { first_name: string | null; last_name: string | null; email: string; phone: string | null } } | null)?.profiles;
  const l = e.listings as unknown as { slug: string; asking_price: number } | null;
  return (
    <>
      <PageHeader eyebrow="Enquiry" title={`${e.buyer_display_name ?? "Buyer"} — ${vehicleName(v)}`} description={`${ENQUIRY_TYPE_LABELS[e.enquiry_type as EnquiryType]} · ${formatDateTime(e.created_at)}`} />
      <div className="grid gap-8 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-8 min-w-0">
          <Card><CardHeader title="Conversation" description="Messages are visible to the buyer (if registered) and seller." /><CardBody>
            {conv ? <ConversationThread conversationId={conv.id} messages={(messages ?? []) as Message[]} viewerRole="staff" buyerName={e.buyer_display_name} canReply={!!e.buyer_id || !!e.seller_id} /> : null}
            {!e.buyer_id ? <p className="mt-3 text-[12.5px] text-muted">Guest enquiry — reply to the buyer by email or phone using the contact details.</p> : null}
          </CardBody></Card>
          <Card><CardHeader title="Activity" description="Call notes, follow-ups and reminders (staff only)." action={isAiConfigured() ? <SimpleAction label="AI triage" action={analyseEnquiry.bind(null, id)} /> : null} /><CardBody className="space-y-5">
            {e.ai_summary ? <div className="rounded-[var(--radius-sm)] border border-accent/30 bg-accent-soft/30 p-3 text-[13px]"><Badge tone="accent">AI suggestion</Badge><p className="mt-2 whitespace-pre-line text-slate">{e.ai_summary}</p></div> : null}
            <ActivityForm enquiryId={id} />
            <ul className="space-y-3">{(activities ?? []).map((a) => (
              <li key={a.id} className="border-t border-line pt-3 text-[13px]"><div className="flex items-center justify-between gap-2"><Badge>{a.activity_type.replace("_", " ")}</Badge>
                {a.due_at && !a.completed_at ? <SimpleAction label="Mark done" action={completeActivity.bind(null, a.id, id)} /> : a.completed_at ? <Badge tone="success">Done</Badge> : null}</div>
                <p className="mt-1 whitespace-pre-line text-charcoal">{a.note}</p>
                <p className="text-[11.5px] text-muted">{displayName((a.profiles as { first_name: string | null; last_name: string | null; email: string }) ?? { first_name: "System", last_name: null, email: "" })} · {formatDateTime(a.created_at)}{a.due_at ? ` · due ${formatDateTime(a.due_at)}` : ""}</p></li>))}</ul>
          </CardBody></Card>
        </div>
        <div className="space-y-8">
          <Card><CardHeader title="Manage" /><CardBody><EnquiryControls enquiryId={id} status={e.enquiry_status} assignedTo={e.assigned_to} priority={e.priority} staffList={(staffList ?? []).map((s) => ({ id: s.id, name: displayName(s) }))} /></CardBody></Card>
          <Card><CardHeader title="Buyer contact (private)" /><CardBody><DefinitionList className="!grid-cols-1" items={[{ label: "Name", value: contact?.full_name }, { label: "Email", value: contact?.email }, { label: "Phone", value: contact?.phone }, { label: "Account", value: e.buyer_id ? "Registered buyer" : "Guest" }, { label: "Offer", value: e.offer_amount ? formatPrice(e.offer_amount) : null }]} /></CardBody></Card>
          <Card><CardHeader title="Seller" /><CardBody><DefinitionList className="!grid-cols-1" items={[{ label: "Name", value: seller ? displayName(seller) : "Managed stock" }, { label: "Email", value: seller?.email }, { label: "Phone", value: seller?.phone }, { label: "Asking", value: formatPrice(l?.asking_price) }]} />
            <div className="mt-3 flex gap-3 text-[13px]"><Link className="underline" href={`/admin/inventory/${v.id}`}>Vehicle record</Link>{l ? <Link className="underline" href={`/cars/${l.slug}`}>Listing</Link> : null}</div></CardBody></Card>
          <Card><CardHeader title="Viewings" /><CardBody className="space-y-4">{(viewings ?? []).map((w) => <p key={w.id} className="text-[13px]"><strong>{formatDateTime(w.scheduled_for)}</strong> · {w.viewing_status}{w.location_note ? ` · ${w.location_note}` : ""}</p>)}<ViewingForm enquiryId={id} /></CardBody></Card>
        </div>
      </div>
    </>
  );
}
