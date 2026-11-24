import type Stripe from "stripe";

/** Minimal DB surface the webhook needs (lets the logic be unit-tested). */
export interface WebhookDb {
  recordEvent(id: string, type: string, payload: unknown): Promise<"new" | "duplicate">;
  markProcessed(id: string, error?: string): Promise<void>;
  getPayment(id: string): Promise<{ id: string; amount: number; payment_status: string; profile_id: string | null; description: string | null } | null>;
  getPaymentByIntent(intentId: string): Promise<{ id: string; amount: number; refunded_amount: number } | null>;
  updatePayment(id: string, patch: Record<string, unknown>): Promise<void>;
  notifyPaid(profileId: string, description: string, amountPence: number): Promise<void>;
}

/**
 * Processes a VERIFIED Stripe event (signature already checked by the route).
 * This is the only code path that can mark a Meridian payment as succeeded.
 */
export async function handleStripeEvent(event: Stripe.Event, db: WebhookDb): Promise<{ handled: boolean; reason?: string }> {
  if ((await db.recordEvent(event.id, event.type, event)) === "duplicate") return { handled: false, reason: "duplicate event" };
  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object as Stripe.Checkout.Session;
        const paymentId = s.metadata?.payment_id ?? s.client_reference_id;
        if (!paymentId) break;
        const payment = await db.getPayment(paymentId);
        if (!payment) throw new Error(`Unknown payment ${paymentId}`);
        if (s.payment_status !== "paid") { await db.updatePayment(paymentId, { payment_status: "processing" }); break; }
        if (s.amount_total !== payment.amount || (s.currency ?? "gbp") !== "gbp") throw new Error("Amount or currency mismatch — not marking as paid");
        if (payment.payment_status === "succeeded") break;
        const intent = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
        if (!intent) throw new Error("No payment intent on session");
        await db.updatePayment(paymentId, { payment_status: "succeeded", stripe_payment_id: intent, stripe_checkout_session_id: s.id, paid_at: new Date((event.created ?? Date.now() / 1000) * 1000).toISOString(), stripe_invoice_id: typeof s.invoice === "string" ? s.invoice : s.invoice?.id ?? null });
        if (payment.profile_id) await db.notifyPaid(payment.profile_id, payment.description ?? "Meridian Motors fee", payment.amount);
        break;
      }
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired": {
        const s = event.data.object as Stripe.Checkout.Session;
        const paymentId = s.metadata?.payment_id ?? s.client_reference_id;
        const payment = paymentId ? await db.getPayment(paymentId) : null;
        if (payment && payment.payment_status !== "succeeded") await db.updatePayment(payment.id, { payment_status: event.type.endsWith("failed") ? "failed" : "pending", failure_reason: event.type });
        break;
      }
      case "charge.succeeded": {
        const c = event.data.object as Stripe.Charge;
        const intent = typeof c.payment_intent === "string" ? c.payment_intent : c.payment_intent?.id;
        const p = intent ? await db.getPaymentByIntent(intent) : null;
        if (p && c.receipt_url) await db.updatePayment(p.id, { receipt_url: c.receipt_url });
        break;
      }
      case "charge.refunded": {
        const c = event.data.object as Stripe.Charge;
        const intent = typeof c.payment_intent === "string" ? c.payment_intent : c.payment_intent?.id;
        const p = intent ? await db.getPaymentByIntent(intent) : null;
        if (p) await db.updatePayment(p.id, { refunded_amount: c.amount_refunded, payment_status: c.amount_refunded >= p.amount ? "refunded" : "partially_refunded" });
        break;
      }
      default:
        await db.markProcessed(event.id);
        return { handled: false, reason: "ignored type" };
    }
    await db.markProcessed(event.id);
    return { handled: true };
  } catch (e) {
    await db.markProcessed(event.id, (e as Error).message);
    throw e;
  }
}
