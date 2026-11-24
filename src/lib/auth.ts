import "server-only";
import { cache } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import type { AppRole, Profile } from "@/lib/types";

export const STAFF: AppRole[] = ["verification_operator", "sales_operator", "admin", "super_admin"];
export const isStaffRole = (r?: AppRole | null) => !!r && STAFF.includes(r);
export const isAdminRole = (r?: AppRole | null) => r === "admin" || r === "super_admin";

export interface Session {
  userId: string;
  email: string;
  profile: Profile;
  sellerId: string | null;
  buyerId: string | null;
}

/** Returns the verified session (validated with Supabase Auth, not just the cookie). */
export const getSession = cache(async (): Promise<Session | null> => {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: profile }, { data: seller }, { data: buyer }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("sellers").select("id").eq("profile_id", user.id).maybeSingle(),
    supabase.from("buyers").select("id").eq("profile_id", user.id).maybeSingle(),
  ]);
  if (!profile || profile.account_status === "suspended" || profile.account_status === "deleted") return null;
  return { userId: user.id, email: user.email ?? profile.email, profile: profile as Profile, sellerId: seller?.id ?? null, buyerId: buyer?.id ?? null };
});

export async function requireUser(next = "/dashboard") {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(next)}`);
  return session;
}

/** Server-side staff gate. Non-staff receive a 404 (admin area is not disclosed). */
export async function requireStaff(roles: AppRole[] = STAFF) {
  const session = await getSession();
  if (!session) redirect("/login?next=/admin");
  const allowed = new Set<AppRole>([...roles, "admin", "super_admin"]);
  if (!allowed.has(session.profile.role)) notFound();
  return session;
}

export async function requireAdmin() {
  return requireStaff(["admin", "super_admin"]);
}

export function displayName(p: Pick<Profile, "first_name" | "last_name" | "email">) {
  const n = [p.first_name, p.last_name].filter(Boolean).join(" ");
  return n || p.email;
}
