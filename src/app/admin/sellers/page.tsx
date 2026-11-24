import Link from "next/link";
import { requireStaff, displayName } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { AssistanceReply } from "@/components/admin/controls";
import { formatDate, timeAgo } from "@/lib/format";

export const metadata = { title: "Sellers" };

export default async function SellersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireStaff();
  const { q } = await searchParams;
  const supabase = await createClient();
  let query = supabase.from("sellers").select("id, seller_type, verification_status, city, created_at, profiles!inner(email, first_name, last_name, phone), vehicles(id, vehicle_status)").order("created_at", { ascending: false }).limit(200);
  if (q) query = query.ilike("profiles.email", `%${q.replace(/[%,]/g, "")}%`);
  const [{ data }, { data: assistance }] = await Promise.all([query,
    supabase.from("assistance_requests").select("*, sellers(profiles(email, first_name, last_name)), vehicles(id, make, model, year)").neq("status", "resolved").order("created_at")]);
  return (
    <>
      <PageHeader eyebrow="Customers" title="Sellers" />
      <Card className="mb-8"><CardHeader title={`Open assistance requests (${assistance?.length ?? 0})`} />
        {assistance?.length ? <ul className="divide-y divide-line">{assistance.map((a) => {
          const s = (a.sellers as unknown as { profiles: { email: string; first_name: string | null; last_name: string | null } }).profiles;
          const v = a.vehicles as { id: string; make: string; model: string; year: number } | null;
          return <li key={a.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_380px]"><div><p className="text-[13.5px] font-medium">{displayName(s)} · <Badge>{a.topic.replace("_", " ")}</Badge> {a.status === "in_progress" ? <Badge tone="info">In progress</Badge> : null}</p>
            {v ? <Link href={`/admin/inventory/${v.id}`} className="text-[12.5px] underline">{v.year} {v.make} {v.model}</Link> : null}<p className="mt-1 text-[13.5px] text-slate">{a.message}</p><p className="text-[12px] text-muted">{timeAgo(a.created_at)}</p></div><AssistanceReply id={a.id} /></li>;
        })}</ul> : <CardBody><p className="text-[13px] text-muted">No open requests.</p></CardBody>}
      </Card>
      <form className="mb-4 max-w-sm"><Input name="q" defaultValue={q} placeholder="Search by email" aria-label="Search sellers" /></form>
      <Card><Table><THead><tr><TH>Seller</TH><TH>Contact</TH><TH>Type</TH><TH>Verification</TH><TH>Vehicles</TH><TH>Joined</TH></tr></THead><TBody>
        {(data ?? []).map((s) => { const p = s.profiles as unknown as { email: string; first_name: string | null; last_name: string | null; phone: string | null }; const vs = (s.vehicles ?? []) as { vehicle_status: string }[];
          return <TR key={s.id}><TD className="font-medium">{displayName(p)}</TD><TD className="text-[12.5px]">{p.email}<span className="block text-muted">{p.phone}</span></TD><TD><Badge tone={s.seller_type === "trade" ? "info" : "neutral"}>{s.seller_type}</Badge></TD>
            <TD>{s.verification_status}</TD><TD>{vs.length} <span className="text-[12px] text-muted">({vs.filter((v) => v.vehicle_status === "completed").length} sold)</span></TD><TD>{formatDate(s.created_at)}</TD></TR>; })}
      </TBody></Table></Card>
    </>
  );
}
