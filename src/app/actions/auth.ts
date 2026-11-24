"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loginSchema, registerSchema, emailSchema, passwordSchema } from "@/lib/validation/public";
import { fail, ok, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { publicEnv, isSupabaseConfigured } from "@/lib/env";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { notify } from "@/lib/notifications";

const safeNext = (n: unknown) => {
  const s = typeof n === "string" ? n : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/dashboard";
};

export async function signIn(_: unknown, formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured) return fail("Accounts are not available yet: the site is not connected to its database. (Administrator: open /api/health for details.)");
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Please check the highlighted fields.", zodFieldErrors(parsed.error.issues));
  if (!(await rateLimit(`login:${await clientKey()}`, 10, 900)) || !(await rateLimit(`login-email:${parsed.data.email}`, 8, 900))) {
    return fail("Too many sign-in attempts. Please wait 15 minutes and try again.");
  }
  const supabase = await createClient();
  let error: { message: string } | null = null;
  try {
    ({ error } = await supabase.auth.signInWithPassword(parsed.data));
  } catch (e) {
    console.error("[signIn]", e);
    return fail("Sign-in is temporarily unavailable. Please try again in a few minutes.");
  }
  if (error) {
    if (/confirm/i.test(error.message)) return fail("Please confirm your email address first — check your inbox for the verification link.");
    return fail("Incorrect email or password.");
  }
  redirect(safeNext(formData.get("next")));
}

export async function signUp(_: unknown, formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured) return fail("Accounts are not available yet: the site is not connected to its database. (Administrator: open /api/health for details.)");
  const raw = Object.fromEntries(formData);
  const parsed = registerSchema.safeParse({ ...raw, terms: raw.terms === "on", marketing: raw.marketing === "on" });
  if (!parsed.success) return fail("Please check the highlighted fields.", zodFieldErrors(parsed.error.issues));
  if (!(await rateLimit(`signup:${await clientKey()}`, 5, 3600))) return fail("Too many sign-up attempts. Please try again later.");
  const d = parsed.data;
  const supabase = await createClient();
  let result: Awaited<ReturnType<typeof supabase.auth.signUp>>;
  try {
    result = await supabase.auth.signUp({
    email: d.email,
    password: d.password,
    options: {
      emailRedirectTo: `${publicEnv.siteUrl}/auth/callback?next=/dashboard`,
      // NOTE: role is NEVER taken from metadata — the database always creates customers.
      data: { first_name: d.firstName, last_name: d.lastName, marketing_consent: !!d.marketing },
    },
  });
  } catch (e) {
    console.error("[signUp]", e);
    return fail("Registration is temporarily unavailable. Please try again in a few minutes.");
  }
  const { data, error } = result;
  if (error) {
    if (/already/i.test(error.message)) return fail("An account with this email already exists. Try signing in.");
    if (/password/i.test(error.message)) return fail(error.message);
    if (/rate limit|too many/i.test(error.message)) return fail("Too many sign-up emails have been sent recently. Please try again in an hour.");
    console.error("[signUp]", error.message);
    return fail("We couldn't create your account. Please try again.");
  }
  if (data.user) {
    try {
      const admin = createAdminClient();
      await admin.from("consent_records").insert([
        { profile_id: data.user.id, consent_type: "terms", granted: true, policy_version: "2026-11-draft" },
        { profile_id: data.user.id, consent_type: "privacy_notice", granted: true, policy_version: "2026-11-draft" },
        { profile_id: data.user.id, consent_type: "marketing_email", granted: !!d.marketing, policy_version: "2026-11-draft" },
      ]);
      await notify(data.user.id, "welcome", "Welcome to Meridian Motors", "Your account is ready. You can save vehicles, make enquiries and sell your car from one account.", "/dashboard");
    } catch (e) { console.error("[signup] post-signup tasks failed", e); }
  }
  if (data.session) redirect("/dashboard");
  return ok(undefined, "Check your inbox — we've sent a link to verify your email address.");
}

export async function requestPasswordReset(_: unknown, formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured) return fail("Accounts are not available yet: the site is not connected to its database. (Administrator: open /api/health for details.)");
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return fail("Enter a valid email address.", { email: "Enter a valid email address" });
  if (!(await rateLimit(`reset:${await clientKey()}`, 5, 3600))) return fail("Too many requests. Please try again later.");
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: `${publicEnv.siteUrl}/auth/callback?next=/reset-password` });
  // Always the same response, so account existence is not disclosed.
  return ok(undefined, "If an account exists for that email, we've sent a password reset link.");
}

export async function updatePassword(_: unknown, formData: FormData): Promise<ActionResult> {
  const pw = passwordSchema.safeParse(formData.get("password"));
  if (!pw.success) return fail(pw.error.issues[0].message, { password: pw.error.issues[0].message });
  if (formData.get("password") !== formData.get("confirm")) return fail("Passwords do not match.", { confirm: "Passwords do not match" });
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: pw.data });
  if (error) return fail("Your reset link has expired. Please request a new one.");
  redirect("/dashboard?password=updated");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  void (await headers());
  redirect("/");
}
