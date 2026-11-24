import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleStripeEvent, type WebhookDb } from "@/lib/stripe-webhook";
import { notify } from "@/lib/notifications";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = serverEnv().stripeWebhookSecret;
  if (!stripe || !secret) return NextResponse.json({ error: "Payments are not configured" }, { status: 503 });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret); // rejects forged/unsigned payloads
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  const admin = createAdminClient();
  const db: WebhookDb = {
    async recordEvent(id, type, payload) {
      const { error } = await admin.from("stripe_events").insert({ id, event_type: type, payload });
      if (error?.code === "23505") {
        const { data } = await admin.from("stripe_events").select("processed_at, processing_error").eq("id", id).single();
        return data?.processed_at && !data.processing_error ? "duplicate" : "new"; // retry previously failed events
      }
      if (error) throw new Error(error.message);
      return "new";
    },
    async markProcessed(id, error) { await admin.from("stripe_events").update({ processed_at: new Date().toISOString(), processing_error: error ?? null }).eq("id", id); },
    async getPayment(id) { const { data } = await admin.from("payments").select("id, amount, payment_status, profile_id, description").eq("id", id).maybeSingle(); return data; },
    async getPaymentByIntent(intent) { const { data } = await admin.from("payments").select("id, amount, refunded_amount").eq("stripe_payment_id", intent).maybeSingle(); return data; },
    async updatePayment(id, patch) { const { error } = await admin.from("payments").update(patch).eq("id", id); if (error) throw new Error(error.message); },
    async notifyPaid(profileId, description, amount) { await notify(profileId, "payment_confirmation", "Your payment confirmation", `We have received your payment of £${(amount / 100).toFixed(2)} for: ${description}.`, "/dashboard/payments"); },
  };
  try {
    await handleStripeEvent(event, db);
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("[stripe webhook]", e);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 }); // Stripe retries
  }
}
