import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { publicEnv, isSupabaseConfigured, integrationStatus, serverEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Deployment status check. Reports which settings are present and whether the
 * database tables exist — never any secret values.
 */
export async function GET() {
  const integ = integrationStatus();
  const checks: Record<string, string> = {
    site_url: publicEnv.siteUrl,
    database_connection_settings: isSupabaseConfigured ? "ok" : "MISSING — connect Supabase in Vercel → Storage, then redeploy",
    server_database_key: integ.supabase_admin ? "ok" : "MISSING — SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY not set; redeploy after connecting Supabase",
  };
  if (isSupabaseConfigured && serverEnv().supabaseServiceRoleKey) {
    try {
      const db = createClient(publicEnv.supabaseUrl, serverEnv().supabaseServiceRoleKey!, { auth: { persistSession: false } });
      const { count, error } = await db.from("platform_settings").select("id", { count: "exact", head: true });
      checks.database_tables = error ? `MISSING — tables not created (${error.code ?? "error"}). Check the build log for [migrate] lines and redeploy.` : `ok (${count} settings)`;
      const { count: admins } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("role", "super_admin");
      checks.super_admin = admins ? "ok" : "none yet — register, set SUPER_ADMIN_EMAIL, redeploy";
    } catch {
      checks.database_tables = "could not reach the database";
    }
  }
  checks.ai = integ.ai ? "configured" : "not configured (optional)";
  checks.payments = integ.stripe ? "configured" : "not configured (optional)";
  checks.email = integ.email ? "configured" : "not configured (optional — Supabase sends sign-up emails itself)";
  checks.dvla = integ.dvla ? "configured" : "not configured (optional)";
  const names = Object.keys(process.env).filter((k) => /SUPABASE|POSTGRES/.test(k)).sort();
  return NextResponse.json({ checks, database_variable_names_present: names }, { headers: { "Cache-Control": "no-store" } });
}
