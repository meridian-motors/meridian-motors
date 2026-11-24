import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { timeAgo, vehicleName } from "@/lib/format";

export const metadata = { title: "Conversations" };

export default async function ConversationsPage() {
  await requireStaff();
  const supabase = await createClient();
  const { data } = await supabase.from("conversations").select("id, last_message_at, enquiries(id, buyer_display_name, enquiry_status, vehicles(make, model, year)), messages(message, sender_role, created_at, read_at)")
    .order("last_message_at", { ascending: false, nullsFirst: false }).limit(100);
  return (
    <>
      <PageHeader eyebrow="Operations" title="Conversations" description="All buyer–seller–Meridian message threads, most recent first." />
      <Card>{!data?.length ? <EmptyState title="No conversations yet" /> : <ul className="divide-y divide-line">{data.map((c) => {
        const e = c.enquiries as unknown as { id: string; buyer_display_name: string | null; enquiry_status: string; vehicles: { make: string; model: string; year: number } };
        const msgs = ((c.messages ?? []) as { message: string; sender_role: string; created_at: string; read_at: string | null }[]).sort((a, b) => b.created_at.localeCompare(a.created_at));
        const last = msgs[0]; const unread = msgs.filter((m) => !m.read_at && m.sender_role !== "staff").length;
        return <li key={c.id}><Link href={`/admin/enquiries/${e.id}`} className="flex items-start justify-between gap-4 px-5 py-4 hover:bg-paper">
          <div className="min-w-0"><p className="text-[14px] font-medium">{e.buyer_display_name ?? "Buyer"} · {vehicleName(e.vehicles)}</p>
            {last ? <p className="mt-0.5 truncate text-[13px] text-slate"><span className="text-muted">{last.sender_role}:</span> {last.message}</p> : null}</div>
          <div className="shrink-0 text-right text-[12px] text-muted">{c.last_message_at ? timeAgo(c.last_message_at) : ""}{unread ? <Badge tone="accent" className="ml-2">{unread} unread</Badge> : null}<p>{msgs.length} messages</p></div></Link></li>;
      })}</ul>}</Card>
    </>
  );
}
