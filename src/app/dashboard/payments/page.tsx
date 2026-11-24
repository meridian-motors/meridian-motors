import { CreditCard } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { integrationStatus } from "@/lib/env";
import { payPayment } from "@/app/actions/seller";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PaymentStatusBadge } from "@/components/dashboard/status";
import { ActionButton } from "@/components/dashboard/small-actions";
import { formatDate, formatPence } from "@/lib/format";
import type { PaymentStatus } from "@/lib/types";

export const metadata = { title: "Payments" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const session = await requireUser();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("payments").select("*").eq("profile_id", session.userId).order("created_at", { ascending: false });
  const stripe = integrationStatus().stripe;
  return (
    <>
      <PageHeader eyebrow="Selling" title="Payments" description="Meridian fees and service payments. We never collect money for the vehicle itself." />
      {sp.checkout === "success" ? <Alert tone="info" className="mb-6">Thank you. Your payment is being confirmed with our payment provider — this page updates once Stripe confirms it.</Alert> : null}
      {sp.checkout === "cancelled" ? <Alert tone="warning" className="mb-6">Payment was cancelled. No money has been taken.</Alert> : null}
      {!stripe ? <Alert tone="neutral" className="mb-6">Online card payments are not yet enabled. Our team will contact you about any fees due.</Alert> : null}
      <Card>
        {!data?.length ? <EmptyState icon={<CreditCard />} title="No payments" description="Fees only become payable when a sale completes." /> : (
          <Table>
            <THead><tr><TH>Description</TH><TH>Created</TH><TH>Amount</TH><TH>Status</TH><TH>Paid</TH><TH /></tr></THead>
            <TBody>{data.map((p) => (
              <TR key={p.id}>
                <TD className="font-medium">{p.description ?? p.payment_type}</TD><TD>{formatDate(p.created_at)}</TD><TD>{formatPence(p.amount)}{p.refunded_amount ? <span className="block text-[12px] text-muted">Refunded {formatPence(p.refunded_amount)}</span> : null}</TD>
                <TD><PaymentStatusBadge status={p.payment_status as PaymentStatus} /></TD><TD>{formatDate(p.paid_at)}</TD>
                <TD className="text-right">{p.payment_status === "pending" && stripe ? <ActionButton size="sm" action={payPayment.bind(null, p.id)}>Pay now</ActionButton> : p.receipt_url ? <a href={p.receipt_url} target="_blank" rel="noopener noreferrer" className="text-[13px] underline">Receipt</a> : null}</TD>
              </TR>
            ))}</TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
