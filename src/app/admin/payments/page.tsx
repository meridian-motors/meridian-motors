import { requireStaff, displayName } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { integrationStatus } from "@/lib/env";
import { decideRefund } from "@/app/actions/admin";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PaymentStatusBadge } from "@/components/dashboard/status";
import { SimpleAction } from "@/components/admin/controls";
import { formatDate, formatPence } from "@/lib/format";
import type { PaymentStatus } from "@/lib/types";

export const metadata = { title: "Payments" };

export default async function AdminPayments() {
  await requireStaff();
  const supabase = await createClient();
  const [{ data: payments }, { data: refunds }] = await Promise.all([
    supabase.from("payments").select("*, profiles(email, first_name, last_name)").order("created_at", { ascending: false }).limit(300),
    supabase.from("refund_requests").select("*, payments(amount, description)").order("created_at", { ascending: false }),
  ]);
  const p = payments ?? [];
  const sum = (f: (x: (typeof p)[number]) => boolean, v: (x: (typeof p)[number]) => number = (x) => x.amount - x.refunded_amount) => p.filter(f).reduce((s, x) => s + v(x), 0);
  return (
    <>
      <PageHeader eyebrow="Commercial" title="Payments" description="Meridian fees and services only. Statuses change exclusively through verified Stripe webhooks." />
      {!integrationStatus().stripe ? <Alert tone="warning" className="mb-6">Stripe is not configured (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET). Fees are recorded as pending; online collection is unavailable.</Alert> : null}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Received" value={formatPence(sum((x) => ["succeeded", "partially_refunded"].includes(x.payment_status)))} />
        <StatCard label="Outstanding" value={formatPence(sum((x) => ["pending", "processing"].includes(x.payment_status), (x) => x.amount))} />
        <StatCard label="Refunded" value={formatPence(p.reduce((s, x) => s + x.refunded_amount, 0))} />
        <StatCard label="Failed" value={p.filter((x) => x.payment_status === "failed").length} />
      </div>
      {(refunds ?? []).length ? <Card className="mb-6"><CardHeader title="Refund requests" /><Table><THead><tr><TH>Payment</TH><TH>Amount</TH><TH>Reason</TH><TH>Status</TH><TH /></tr></THead><TBody>
        {(refunds ?? []).map((r) => <TR key={r.id}><TD>{(r.payments as { description: string }).description}</TD><TD>{formatPence(r.amount)}</TD><TD className="max-w-xs text-[13px]">{r.reason}</TD><TD>{r.request_status}</TD>
          <TD>{r.request_status === "requested" ? <div className="flex gap-1"><SimpleAction label="Approve & refund" variant="primary" action={decideRefund.bind(null, r.id, true)} confirmText="Issue this refund via Stripe?" /><SimpleAction label="Reject" action={decideRefund.bind(null, r.id, false)} /></div> : null}</TD></TR>)}</TBody></Table></Card> : null}
      <Card><Table><THead><tr><TH>Customer</TH><TH>Description</TH><TH>Type</TH><TH>Amount</TH><TH>Status</TH><TH>Stripe</TH><TH>Created</TH><TH>Paid</TH></tr></THead><TBody>
        {p.map((x) => <TR key={x.id}><TD className="text-[13px]">{x.profiles ? displayName(x.profiles as { email: string; first_name: string | null; last_name: string | null }) : "—"}</TD><TD>{x.description}</TD><TD>{x.payment_type.replace("_", " ")}</TD>
          <TD>{formatPence(x.amount)}</TD><TD><PaymentStatusBadge status={x.payment_status as PaymentStatus} /></TD><TD className="font-mono text-[11.5px]">{x.stripe_payment_id ?? "—"}</TD><TD>{formatDate(x.created_at)}</TD><TD>{formatDate(x.paid_at)}</TD></TR>)}
      </TBody></Table></Card>
    </>
  );
}
