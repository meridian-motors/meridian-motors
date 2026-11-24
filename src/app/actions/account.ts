"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { fail, ok, zodFieldErrors, dbErrorMessage, type ActionResult } from "@/lib/action-result";
import { notifyStaff } from "@/lib/notifications";

const profileSchema = z.object({
  first_name: z.string().trim().min(1, "Enter your first name").max(80),
  last_name: z.string().trim().min(1, "Enter your last name").max(80),
  phone: z.union([z.string().trim().regex(/^[0-9+() -]{7,20}$/, "Enter a valid phone number"), z.literal("")]).transform((v) => v || null),
});

export async function updateProfile(_: unknown, formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return fail("Please sign in");
  const p = profileSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) return fail("Please check the highlighted fields.", zodFieldErrors(p.error.issues));
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(p.data).eq("id", session.userId);
  if (error) return fail(dbErrorMessage(error));
  revalidatePath("/dashboard", "layout");
  return ok(undefined, "Profile updated.");
}

const PREFS = ["email_enquiries", "email_listing_updates", "email_valuations", "email_buyer_matches", "email_saved_search_alerts", "email_marketing"] as const;

export async function updateNotificationPreferences(_: unknown, formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return fail("Please sign in");
  const values = Object.fromEntries(PREFS.map((k) => [k, formData.get(k) === "on"])) as Record<(typeof PREFS)[number], boolean>;
  const supabase = await createClient();
  const { error } = await supabase.from("notification_preferences").update(values).eq("profile_id", session.userId);
  if (error) return fail(dbErrorMessage(error));
  if (values.email_marketing !== session.profile.marketing_consent) {
    await supabase.from("profiles").update({ marketing_consent: values.email_marketing }).eq("id", session.userId);
    await supabase.from("consent_records").insert({ profile_id: session.userId, consent_type: "marketing_email", granted: values.email_marketing, policy_version: "2026-11-draft" });
  }
  revalidatePath("/dashboard/settings");
  return ok(undefined, "Preferences saved.");
}

export async function requestAccountDeletion(confirmText: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return fail("Please sign in");
  if (confirmText.trim().toUpperCase() !== "DELETE") return fail('Type "DELETE" to confirm.');
  const supabase = await createClient();
  const { error } = await supabase.from("data_requests").insert({ profile_id: session.userId, email: session.email, request_type: "deletion", details: "Requested from account settings" });
  if (error) return fail(dbErrorMessage(error));
  const { error: pErr } = await supabase.from("profiles").update({ account_status: "pending_deletion", deletion_requested_at: new Date().toISOString() }).eq("id", session.userId);
  if (pErr) return fail(dbErrorMessage(pErr));
  await notifyStaff("data_request", "Account deletion requested", session.email, "/admin/users?tab=requests");
  return ok(undefined, "Your deletion request has been received. We'll confirm by email within one month. Records we must keep by law (such as completed sales and payments) are retained and restricted.");
}
