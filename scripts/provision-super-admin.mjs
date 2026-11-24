#!/usr/bin/env node
/**
 * Secure initial super-admin provisioning.
 *
 *   SUPER_ADMIN_EMAIL=you@company.co.uk npm run admin:provision
 *
 * - Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server secret).
 * - The user must already have registered and verified their email, OR the script
 *   sends them a Supabase invite email (no password is ever set or printed here).
 * - Roles can never be granted from the browser: the database only allows role
 *   changes by an existing super admin or by the service role used here.
 * Run it once from a trusted machine, then remove SUPER_ADMIN_EMAIL from the env.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = (process.argv[2] ?? process.env.SUPER_ADMIN_EMAIL ?? "").trim().toLowerCase();
if (!url || !key) { console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required."); process.exit(1); }
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { console.error("Provide SUPER_ADMIN_EMAIL (or pass the email as an argument)."); process.exit(1); }

const supabase = createClient(url, key, { auth: { persistSession: false } });
let { data: profile } = await supabase.from("profiles").select("id, role").eq("email", email).maybeSingle();
if (!profile) {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo: `${site}/auth/callback?next=/reset-password` });
  if (error) { console.error("Invite failed:", error.message); process.exit(1); }
  console.log(`Invitation email sent to ${email}.`);
  ({ data: profile } = await supabase.from("profiles").select("id, role").eq("id", data.user.id).single());
}
const { error } = await supabase.from("profiles").update({ role: "super_admin" }).eq("id", profile.id);
if (error) { console.error("Could not grant role:", error.message); process.exit(1); }
await supabase.from("audit_logs").insert({ action: "super_admin_provisioned", entity_type: "profiles", entity_id: profile.id, new_values: { role: "super_admin", via: "provisioning script" } });
console.log(`✓ ${email} is now a super administrator.`);
