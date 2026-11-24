import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Audit logs" };
const PAGE = 100;

export default async function AuditLogs({ searchParams }: { searchParams: Promise<{ entity?: string; id?: string; user?: string; page?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();
  let q = supabase.from("audit_logs").select("*", { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (sp.entity) q = q.eq("entity_type", sp.entity);
  if (sp.id && /^[0-9a-f-]{36}$/.test(sp.id)) q = q.eq("entity_id", sp.id);
  if (sp.user && /^[0-9a-f-]{36}$/.test(sp.user)) q = q.eq("user_id", sp.user);
  const { data, count } = await q;
  const userIds = [...new Set((data ?? []).map((r) => r.user_id).filter(Boolean))] as string[];
  const { data: users } = userIds.length ? await supabase.from("profiles").select("id, email").in("id", userIds) : { data: [] };
  const email = (id: string | null) => (id ? users?.find((u) => u.id === id)?.email ?? id.slice(0, 8) : "system");
  return (
    <>
      <PageHeader eyebrow="System" title="Audit logs" description={`Immutable record of important changes (${count ?? 0} entries). Records cannot be edited or deleted.`} />
      <form className="mb-4 grid gap-2 sm:grid-cols-[200px_1fr_1fr_auto]">
        <Select name="entity" defaultValue={sp.entity ?? ""} aria-label="Entity"><option value="">All entities</option>{["vehicles", "listings", "vehicle_sale_terms", "profiles", "transactions", "payments", "platform_settings", "vehicle_verifications", "vehicle_documents", "price_recommendations", "service_catalog", "analytics"].map((e) => <option key={e}>{e}</option>)}</Select>
        <Input name="id" defaultValue={sp.id} placeholder="Entity ID" aria-label="Entity ID" /><Input name="user" defaultValue={sp.user} placeholder="User ID" aria-label="User ID" /><Button type="submit" variant="secondary">Filter</Button>
      </form>
      <Card><Table><THead><tr><TH>Time</TH><TH>User</TH><TH>Action</TH><TH>Entity</TH><TH>Changes</TH></tr></THead><TBody>
        {(data ?? []).map((r) => <TR key={r.id}><TD className="whitespace-nowrap align-top">{formatDateTime(r.created_at)}</TD><TD className="align-top text-[12.5px]">{email(r.user_id)}</TD><TD className="align-top"><Badge>{r.action}</Badge></TD>
          <TD className="align-top text-[12.5px]">{r.entity_type}{r.entity_id ? <Link href={`?entity=${r.entity_type}&id=${r.entity_id}`} className="block font-mono text-[11px] text-muted hover:underline">{r.entity_id.slice(0, 8)}…</Link> : null}</TD>
          <TD className="max-w-xl align-top"><details><summary className="cursor-pointer text-[12px] text-muted">{Object.keys(r.new_values ?? r.old_values ?? {}).slice(0, 5).join(", ") || "details"}</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-paper p-2 text-[11px]">{JSON.stringify({ old: r.old_values, new: r.new_values }, null, 2)}</pre></details></TD></TR>)}
      </TBody></Table></Card>
      {(count ?? 0) > PAGE ? <div className="mt-4 flex justify-between text-[13px]">{page > 1 ? <Link href={`?${new URLSearchParams({ ...sp, page: String(page - 1) } as Record<string, string>)}`}>← Newer</Link> : <span />}{page * PAGE < (count ?? 0) ? <Link href={`?${new URLSearchParams({ ...sp, page: String(page + 1) } as Record<string, string>)}`}>Older →</Link> : <span />}</div> : null}
    </>
  );
}
