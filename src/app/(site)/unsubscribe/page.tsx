import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { integrationStatus } from "@/lib/env";
import { ContentHero } from "@/components/site/content";

export const metadata: Metadata = { title: "Email preferences", robots: { index: false } };

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  let message = "This unsubscribe link is invalid or has expired. You can manage your email preferences from your account settings.";
  if (token && /^[a-f0-9]{48}$/.test(token) && integrationStatus().supabase_admin) {
    const admin = createAdminClient();
    const { data } = await admin.from("notification_preferences")
      .update({ email_marketing: false, email_buyer_matches: false, email_saved_search_alerts: false })
      .eq("unsubscribe_token", token).select("profile_id").maybeSingle();
    if (data) {
      await admin.from("profiles").update({ marketing_consent: false }).eq("id", data.profile_id);
      await admin.from("consent_records").insert({ profile_id: data.profile_id, consent_type: "marketing_email", granted: false, policy_version: "unsubscribe-link" });
      message = "You have been unsubscribed from marketing, match and alert emails. You will still receive essential emails about your account, listings and payments.";
    }
  }
  return <ContentHero eyebrow="Email preferences" title="Unsubscribe" intro={message} />;
}
