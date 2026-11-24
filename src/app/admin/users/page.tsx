import { requireAdmin, displayName, isAdminRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { setAccountStatus } from "@/app/actions/admin";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { RoleSelect, SimpleAction, DataRequestControls } from "@/components/admin/controls";
import { formatDate } from "@/lib/format";
import type { AppRole } from "@/lib/types";

export const metadata = { title: "Users & roles" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await requireAdmin();
  const { q } = await searchParams;
  const supabase = await createClient();
  let query = supabase.from("profiles").select("id, email, first_name, last_name, role, account_status, created_at, marketing_consent").order("created_at", { ascending: false }).limit(300);
  if (q) query = query.ilike("email", `%${q.replace(/[%,]/g, "")}%`);
  const [{ data }, { data: requests }] = await Promise.all([query, supabase.from("data_requests").select("*").not("request_status", "in", "(completed,refused)").order("due_by")]);
  const superAdmin = session.profile.role === "super_admin";
  return (
    <>
      <PageHeader eyebrow="Customers" title="Users & roles" description="Role changes are enforced in the database: only super administrators can grant administrator roles, and nobody can change their own role." />
      <Card className="mb-8"><CardHeader title={`Data protection requests (${requests?.length ?? 0} open)`} description="UK GDPR: respond within one month." />
        <Table><THead><tr><TH>Email</TH><TH>Type</TH><TH>Details</TH><TH>Due</TH><TH>Status</TH></tr></THead><TBody>
          {(requests ?? []).map((r) => <TR key={r.id}><TD>{r.email}</TD><TD><Badge tone={r.request_type === "deletion" ? "danger" : "info"}>{r.request_type}</Badge></TD><TD className="max-w-xs text-[12.5px]">{r.details}</TD>
            <TD className={new Date(r.due_by) < new Date() ? "text-danger" : ""}>{formatDate(r.due_by)}</TD><TD className="min-w-[220px]"><DataRequestControls id={r.id} status={r.request_status} /></TD></TR>)}
          {!(requests ?? []).length ? <TR><TD colSpan={5} className="text-center text-muted">No open requests.</TD></TR> : null}
        </TBody></Table></Card>
      <form className="mb-4 max-w-sm"><Input name="q" defaultValue={q} placeholder="Search by email" aria-label="Search users" /></form>
      <Card><Table><THead><tr><TH>User</TH><TH>Role</TH><TH>Status</TH><TH>Marketing</TH><TH>Joined</TH><TH /></tr></THead><TBody>
        {(data ?? []).map((u) => <TR key={u.id}><TD><span className="font-medium">{displayName(u)}</span><span className="block text-[12px] text-muted">{u.email}</span></TD>
          <TD>{u.id === session.userId ? <Badge tone="dark">{u.role.replace("_", " ")} (you)</Badge> : <RoleSelect profileId={u.id} role={u.role as AppRole} canGrantAdmin={superAdmin} />}</TD>
          <TD><Badge tone={u.account_status === "active" ? "success" : u.account_status === "suspended" ? "danger" : "warning"}>{u.account_status.replace("_", " ")}</Badge></TD><TD>{u.marketing_consent ? "Yes" : "No"}</TD><TD>{formatDate(u.created_at)}</TD>
          <TD>{u.id !== session.userId && (!isAdminRole(u.role as AppRole) || superAdmin) ? <SimpleAction label={u.account_status === "suspended" ? "Reactivate" : "Suspend"} variant="ghost" action={setAccountStatus.bind(null, u.id, u.account_status === "suspended" ? "active" : "suspended")} confirmText="Change this account's status?" /> : null}</TD></TR>)}
      </TBody></Table></Card>
    </>
  );
}
