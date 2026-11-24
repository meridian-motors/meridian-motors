import "server-only";
import Stripe from "stripe";
import { serverEnv, publicEnv } from "@/lib/env";

let stripe: Stripe | null = null;
export function getStripe() {
  const key = serverEnv().stripeSecretKey;
  if (!key) return null;
  stripe ??= new Stripe(key, { maxNetworkRetries: 2, appInfo: { name: "Meridian Motors" } });
  return stripe;
}

/**
 * Creates a Stripe Checkout session for a Meridian fee or service payment.
 * The payment is ONLY marked successful by the verified webhook
 * (/api/stripe/webhook), never by this redirect flow.
 */
export async function createCheckoutSession(p: { paymentId: string; amountPence: number; description: string; customerEmail: string }) {
  const s = getStripe();
  if (!s) return null;
  return s.checkout.sessions.create({
    mode: "payment",
    customer_email: p.customerEmail,
    client_reference_id: p.paymentId,
    metadata: { payment_id: p.paymentId },
    payment_intent_data: { metadata: { payment_id: p.paymentId }, description: p.description },
    line_items: [{ quantity: 1, price_data: { currency: "gbp", unit_amount: p.amountPence, product_data: { name: p.description } } }],
    invoice_creation: { enabled: true },
    success_url: `${publicEnv.siteUrl}/dashboard/payments?checkout=success`,
    cancel_url: `${publicEnv.siteUrl}/dashboard/payments?checkout=cancelled`,
  }, { idempotencyKey: `checkout-${p.paymentId}-${p.amountPence}` });
}
