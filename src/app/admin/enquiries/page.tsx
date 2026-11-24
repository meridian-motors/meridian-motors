import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { resolveContact } from "@/app/actions/admin";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EnquiryStatusBadge } from "@/components/dashboard/status";
import { SimpleAction } from "@/components/admin/controls";
import { ENQUIRY_STATUS_META, ENQUIRY_TYPE_LABELS } from "@/lib/constants";
import { formatDateTime, formatPrice, timeAgo, vehicleName } from "@/lib/format";
import type { EnquiryStatus, EnquiryType } from "@/lib/types";

export const metadata = { title: "Enquiries" };

export default async function AdminEnquiries({ searchParams }: { searchParams: Promise<{ status?: string; tab?: string; mine?: string; due?: string }> }) {
  const session = await requireStaff();
  const sp = await searchParams;
  const supabase = await createClient();
  const tab = sp.tab === "contact" ? "contact" : "enquiries";
  const tabs = <div className="mb-5 flex gap-2">{[["enquiries", "Vehicle enquiries"], ["contact", "Contact messages"]].map(([k, l]) => <Button key={k} asChild size="sm" variant={tab === k ? "primary" : "secondary"}><Link href={`/admin/enquiries?tab=${k}`}>{l}</Link></Button>)}</div>;

  if (tab === "contact") {
    const { data } = await supabase.from("contact_messages").select("*").neq("status", "spam").order("created_at", { ascending: false }).limit(200);
    return (<><PageHeader eyebrow="Operations" title="Enquiries" />{tabs}<Card>{!data?.length ? <EmptyState title="No contact messages" /> : <ul className="divide-y divide-line">{data.map((m) => (
      <li key={m.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:justify-between"><div className="min-w-0"><p className="text-[14px] font-medium">{m.full_name} <span className="font-normal text-muted">· {m.email} {m.phone ? `· ${m.phone}` : ""}</span></p>
        <p className="mt-0.5"><Badge tone={m.topic === "complaint" ? "danger" : m.topic === "data_protection" ? "warning" : "neutral"}>{m.topic.replace("_", " ")}</Badge> <Badge tone={m.status === "new" ? "accent" : m.status === "resolved" ? "success" : "info"}>{m.status}</Badge> <span className="text-[12px] text-muted">{formatDateTime(m.created_at)}</span></p>
        <p className="mt-2 whitespace-pre-line text-[13.5px] text-slate">{m.message}</p></div>
        <div className="flex shrink-0 gap-2"><SimpleAction label="In progress" action={resolveContact.bind(null, m.id, "in_progress")} /><SimpleAction label="Resolved" action={resolveContact.bind(null, m.id, "resolved")} /><SimpleAction label="Spam" variant="ghost" action={resolveContact.bind(null, m.id, "spam")} /></div></li>))}</ul>}</Card></>);
  }

  let q = supabase.from("enquiries").select("id, enquiry_type, enquiry_status, priority, offer_amount, buyer_display_name, follow_up_at, created_at, assigned_to, ai_category, vehicles(make, model, year), profiles:assigned_to(first_name, email)").order("created_at", { ascending: false }).limit(300);
  if (sp.status) q = q.eq("enquiry_status", sp.status); else q = q.not("enquiry_status", "in", "(closed_won,closed_lost,spam)");
  if (sp.mine) q = q.eq("assigned_to", session.userId);
  if (sp.due) q = q.lte("follow_up_at", new Date().toISOString());
  const { data } = await q;
  return (
    <>
      <PageHeader eyebrow="Operations" title="Enquiries" description="Assign, follow up and track every buyer enquiry." />
      {tabs}
      <form className="mb-4 flex flex-wrap gap-2"><input type="hidden" name="tab" value="enquiries" />
        <Select name="status" defaultValue={sp.status ?? ""} className="w-52" aria-label="Status"><option value="">Open enquiries</option>{Object.entries(ENQUIRY_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="mine" value="1" defaultChecked={!!sp.mine} className="accent-ink" />Assigned to me</label>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="due" value="1" defaultChecked={!!sp.due} className="accent-ink" />Follow-up due</label>
        <Button type="submit" size="sm" variant="secondary">Filter</Button></form>
      <Card>{!data?.length ? <EmptyState title="No enquiries match" /> : <Table><THead><tr><TH>Buyer</TH><TH>Vehicle</TH><TH>Type</TH><TH>Priority</TH><TH>Assigned</TH><TH>Follow-up</TH><TH>Received</TH><TH>Status</TH></tr></THead><TBody>
        {data.map((e) => { const v = e.vehicles as unknown as { make: string; model: string; year: number }; const a = e.profiles as unknown as { first_name: string | null; email: string } | null;
          return <TR key={e.id}><TD><Link href={`/admin/enquiries/${e.id}`} className="font-medium hover:underline">{e.buyer_display_name ?? "Buyer"}</Link>{e.ai_category ? <span className="block text-[11.5px] text-muted">AI: {e.ai_category.replace("_", " ")}</span> : null}</TD>
            <TD>{vehicleName(v)}</TD><TD>{ENQUIRY_TYPE_LABELS[e.enquiry_type as EnquiryType]}{e.offer_amount ? <span className="block text-[12px] text-accent-strong">{formatPrice(e.offer_amount)}</span> : null}</TD>
            <TD><Badge tone={e.priority === "high" ? "danger" : e.priority === "low" ? "neutral" : "info"}>{e.priority}</Badge></TD><TD className="text-[12.5px]">{a ? a.first_name ?? a.email : "—"}</TD>
            <TD className="text-[12.5px]">{e.follow_up_at ? <span className={new Date(e.follow_up_at) < new Date() ? "text-danger" : ""}>{formatDateTime(e.follow_up_at)}</span> : "—"}</TD><TD className="whitespace-nowrap">{timeAgo(e.created_at)}</TD><TD><EnquiryStatusBadge status={e.enquiry_status as EnquiryStatus} /></TD></TR>; })}
      </TBody></Table>}</Card>
    </>
  );
}
