import { describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { handleStripeEvent, type WebhookDb } from "./stripe-webhook";

function db(payment = { id: "pay_1", amount: 19900, payment_status: "pending", profile_id: "u1", description: "Fee" }) {
  const events = new Set<string>();
  const updates: Record<string, unknown>[] = [];
  const d: WebhookDb & { updates: typeof updates } = {
    updates,
    recordEvent: async (id) => (events.has(id) ? "duplicate" : (events.add(id), "new")),
    markProcessed: async () => {},
    getPayment: async (id) => (id === payment.id ? payment : null),
    getPaymentByIntent: async () => ({ id: payment.id, amount: payment.amount, refunded_amount: 0 }),
    updatePayment: async (_id, patch) => { updates.push(patch); },
    notifyPaid: vi.fn(async () => {}),
  };
  return d;
}
const session = (over: Partial<Stripe.Checkout.Session> = {}) => ({
  id: "evt_" + Math.random(), type: "checkout.session.completed", created: 1764000000,
  data: { object: { id: "cs_1", metadata: { payment_id: "pay_1" }, payment_status: "paid", amount_total: 19900, currency: "gbp", payment_intent: "pi_1", ...over } },
}) as unknown as Stripe.Event;

describe("Stripe webhook handling", () => {
  it("marks a payment succeeded only from a paid checkout session with matching amount", async () => {
    const d = db();
    await handleStripeEvent(session(), d);
    expect(d.updates[0]).toMatchObject({ payment_status: "succeeded", stripe_payment_id: "pi_1" });
    expect(d.notifyPaid).toHaveBeenCalled();
  });
  it("refuses to mark paid when the amount does not match", async () => {
    const d = db();
    await expect(handleStripeEvent(session({ amount_total: 100 }), d)).rejects.toThrow(/mismatch/);
    expect(d.updates).toHaveLength(0);
  });
  it("does not mark paid when the session is unpaid", async () => {
    const d = db();
    await handleStripeEvent(session({ payment_status: "unpaid" }), d);
    expect(d.updates[0]).toEqual({ payment_status: "processing" });
  });
  it("is idempotent for duplicate events", async () => {
    const d = db();
    const e = session();
    await handleStripeEvent(e, d);
    const r = await handleStripeEvent(e, d);
    expect(r.reason).toBe("duplicate event");
    expect(d.updates).toHaveLength(1);
  });
  it("records refunds", async () => {
    const d = db();
    await handleStripeEvent({ id: "evt_r", type: "charge.refunded", data: { object: { payment_intent: "pi_1", amount_refunded: 19900 } } } as unknown as Stripe.Event, d);
    expect(d.updates[0]).toEqual({ refunded_amount: 19900, payment_status: "refunded" });
  });
  it("Stripe signature verification rejects forged payloads", () => {
    const stripe = new Stripe("sk_test_dummy");
    const payload = JSON.stringify(session());
    const secret = "whsec_test_secret";
    const good = stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(() => stripe.webhooks.constructEvent(payload, good, secret)).not.toThrow();
    expect(() => stripe.webhooks.constructEvent(payload.replace("19900", "1"), good, secret)).toThrow();
    expect(() => stripe.webhooks.constructEvent(payload, "t=1,v1=forged", secret)).toThrow();
  });
});
