import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import { sendEmail } from "@/lib/email/send";
import { NOTIFICATION_TEMPLATE, renderTemplate } from "@/lib/email/templates";

/** Create an in-app notification and (best effort) send its email immediately. */
export async function notify(profileId: string, type: string, title: string, message: string, link?: string | null) {
  const admin = createAdminClient();
  const { data } = await admin.from("notifications")
    .insert({ profile_id: profileId, notification_type: type, title, message, link: link ?? null, email_status: "queued" })
    .select("id").single();
  if (data?.id) await deliverNotification(data.id).catch((e) => console.error("[notify] email failed", e));
}

export async function deliverNotification(id: string) {
  const admin = createAdminClient();
  const { data: n } = await admin.from("notifications")
    .select("id, profile_id, notification_type, title, message, link, email_status, profiles(email, first_name, account_status)")
    .eq("id", id).single();
  if (!n || n.email_status !== "queued") return;
  const profile = (Array.isArray(n.profiles) ? n.profiles[0] : n.profiles) as { email: string; first_name: string | null; account_status: string } | null;
  const meta = NOTIFICATION_TEMPLATE[n.notification_type] ?? { template: "generic" as const, preference: "email_listing_updates" };
  const { data: prefs } = await admin.from("notification_preferences").select("*").eq("profile_id", n.profile_id).maybeSingle();

  if (!profile || profile.account_status !== "active") {
    await admin.from("notifications").update({ email_status: "not_required" }).eq("id", id);
    return;
  }
  if (meta.preference && prefs && prefs[meta.preference] === false) {
    await admin.from("notifications").update({ email_status: "skipped_preference" }).eq("id", id);
    return;
  }
  const unsubscribeUrl = prefs?.unsubscribe_token ? `${publicEnv.siteUrl}/unsubscribe?token=${prefs.unsubscribe_token}` : undefined;
  const email = renderTemplate(meta.template, { firstName: profile.first_name, title: n.title, message: n.message, link: n.link, unsubscribeUrl });
  const res = await sendEmail(profile.email, email.subject, email.html, email.text, { unsubscribeUrl });
  await admin.from("notifications").update({ email_status: res.status === "sent" ? "sent" : res.status === "unconfigured" ? "unconfigured" : "failed" }).eq("id", id);
}

/** Cron: deliver any queued notifications (e.g. created by database functions). */
export async function deliverQueued(limit = 50) {
  const admin = createAdminClient();
  const { data } = await admin.from("notifications").select("id").eq("email_status", "queued").order("created_at").limit(limit);
  let n = 0;
  for (const row of data ?? []) { await deliverNotification(row.id); n++; }
  return n;
}

export async function notifyStaff(type: string, title: string, message: string, link?: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("id").in("role", ["sales_operator", "admin", "super_admin"]).eq("account_status", "active").limit(50);
  await Promise.all((data ?? []).map((p) => admin.from("notifications").insert({ profile_id: p.id, notification_type: type, title, message, link: link ?? null, email_status: "not_required" })));
}
