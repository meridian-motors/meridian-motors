import { publicEnv } from "@/lib/env";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Branded, table-based transactional email layout (renders in all major clients). */
export function layout(opts: { preheader: string; heading: string; body: string[]; cta?: { label: string; href: string }; footerNote?: string; unsubscribeUrl?: string }) {
  const site = publicEnv.siteUrl;
  const href = (h: string) => (h.startsWith("http") ? h : `${site}${h}`);
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.heading)}</title></head>
<body style="margin:0;background:#F7F7F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#151719;">
<span style="display:none;max-height:0;overflow:hidden;">${esc(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F7F4;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E8E9E7;">
<tr><td style="background:#0D0F10;padding:22px 32px;">
  <span style="color:#FFFFFF;font-size:13px;letter-spacing:0.28em;font-weight:600;">MERIDIAN</span><span style="color:#A88C63;font-size:13px;letter-spacing:0.28em;font-weight:600;"> MOTORS</span>
</td></tr>
<tr><td style="padding:36px 32px 8px;">
  <h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;font-weight:600;letter-spacing:-0.02em;color:#0D0F10;">${esc(opts.heading)}</h1>
  ${opts.body.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#3A3E43;">${esc(p)}</p>`).join("")}
  ${opts.cta ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 10px;"><tr><td style="background:#0D0F10;"><a href="${esc(href(opts.cta.href))}" style="display:inline-block;padding:13px 24px;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:500;">${esc(opts.cta.label)}</a></td></tr></table>` : ""}
</td></tr>
<tr><td style="padding:24px 32px 32px;border-top:1px solid #E8E9E7;">
  <p style="margin:0;font-size:12px;line-height:1.6;color:#85898D;">${esc(opts.footerNote ?? "You are receiving this email because of activity on your Meridian Motors account.")}</p>
  ${opts.unsubscribeUrl ? `<p style="margin:8px 0 0;font-size:12px;color:#85898D;"><a href="${esc(opts.unsubscribeUrl)}" style="color:#85898D;">Manage email preferences</a></p>` : ""}
  <p style="margin:8px 0 0;font-size:12px;color:#B7BBC0;">Meridian Motors · Premium Automotive Marketplace</p>
</td></tr></table></td></tr></table></body></html>`;
}

export type TemplateKey =
  | "welcome" | "submission_received" | "valuation_ready" | "listing_approved" | "enquiry_received"
  | "vehicle_sold" | "payment_confirmation" | "generic";

export function renderTemplate(key: TemplateKey, data: { firstName?: string | null; title: string; message: string; link?: string | null; unsubscribeUrl?: string }) {
  const hi = data.firstName ? `Hello ${data.firstName},` : "Hello,";
  const map: Record<TemplateKey, { subject: string; cta?: string; extra?: string[] }> = {
    welcome: { subject: "Welcome to Meridian Motors", cta: "Go to your dashboard", extra: ["You can buy and sell from the same account — save vehicles, make enquiries, or submit your own car for sale whenever you are ready."] },
    submission_received: { subject: "Your vehicle submission has been received", cta: "View your submission", extra: ["Our team will review your details and photographs. We will contact you if anything else is needed."] },
    valuation_ready: { subject: "Your valuation is ready", cta: "Review your valuation", extra: ["Valuations are indicative and are not a guaranteed sale price. You always choose and approve your asking price."] },
    listing_approved: { subject: "Your vehicle listing is approved", cta: "View your listing" },
    enquiry_received: { subject: "You have received a new enquiry", cta: "Read the enquiry" },
    vehicle_sold: { subject: "Your vehicle has been marked as sold", cta: "View sale details" },
    payment_confirmation: { subject: "Your payment confirmation", cta: "View payment history", extra: ["Please keep this email for your records."] },
    generic: { subject: data.title, cta: data.link ? "View in your account" : undefined },
  };
  const t = map[key];
  return {
    subject: t.subject,
    html: layout({
      preheader: data.message, heading: data.title, body: [hi, data.message, ...(t.extra ?? [])],
      cta: data.link && t.cta ? { label: t.cta, href: data.link } : undefined, unsubscribeUrl: data.unsubscribeUrl,
    }),
    text: `${hi}\n\n${data.message}\n\n${(t.extra ?? []).join("\n\n")}\n\n${data.link ? `${publicEnv.siteUrl}${data.link}` : ""}\n\nMeridian Motors`,
  };
}

export const NOTIFICATION_TEMPLATE: Record<string, { template: TemplateKey; preference: string | null }> = {
  welcome: { template: "welcome", preference: null },
  submission_received: { template: "submission_received", preference: "email_listing_updates" },
  valuation_ready: { template: "valuation_ready", preference: "email_valuations" },
  listing_approved: { template: "listing_approved", preference: "email_listing_updates" },
  listing_published: { template: "listing_approved", preference: "email_listing_updates" },
  listing_update: { template: "generic", preference: "email_listing_updates" },
  information_requested: { template: "generic", preference: "email_listing_updates" },
  enquiry_received: { template: "enquiry_received", preference: "email_enquiries" },
  message_received: { template: "generic", preference: "email_enquiries" },
  viewing_update: { template: "generic", preference: "email_enquiries" },
  vehicle_sold: { template: "vehicle_sold", preference: "email_listing_updates" },
  payment_confirmation: { template: "payment_confirmation", preference: null },
  payment_due: { template: "generic", preference: null },
  buyer_match: { template: "generic", preference: "email_buyer_matches" },
  saved_search_alert: { template: "generic", preference: "email_saved_search_alerts" },
};
