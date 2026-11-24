#!/usr/bin/env node
/**
 * Vercel build entry point.
 *  1. Applies pending SQL migrations (supabase/migrations) to the connected
 *     Supabase database, tracked in supabase_migrations.schema_migrations
 *     (the same table the Supabase CLI uses, so `supabase db push` stays compatible).
 *  2. Optionally promotes SUPER_ADMIN_EMAIL to super_admin (one-off provisioning;
 *     the account must already exist). Remove the variable afterwards.
 *  3. Runs `next build`.
 * Requires POSTGRES_URL_NON_POOLING (set by the Vercel ↔ Supabase integration) or
 * SUPABASE_DB_URL. Without one, migrations are skipped and the build continues.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import pg from "pg";

const url = process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!url) {
  console.log("[migrate] No database URL configured — skipping migrations.");
} else {
  // Supabase's server certificate chains to Supabase's own CA (not in Node's store).
  // Connection is still encrypted; this is a build-time, server-to-server connection.
  const conn = url.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, "");
  const client = new pg.Client({ connectionString: conn, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false }, statement_timeout: 120000 });
  await client.connect();
  await client.query(`create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)`);
  const { rows } = await client.query("select version from supabase_migrations.schema_migrations");
  const done = new Set(rows.map((r) => r.version));
  const dir = join(process.cwd(), "supabase", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const version = file.split("_")[0];
    if (done.has(version)) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    console.log(`[migrate] applying ${file}`);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)", [version, file.replace(/^\d+_|\.sql$/g, "")]);
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      console.error(`[migrate] FAILED on ${file}: ${e.message}`);
      process.exit(1);
    }
  }
  const email = (process.env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase();
  if (email) {
    const r = await client.query("select id from public.profiles where email = $1", [email]);
    if (!r.rows.length) {
      console.log(`[provision] ${email} has not registered yet — register on the site, then redeploy.`);
    } else {
      const id = r.rows[0].id;
      await client.query("update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1", [id]);
      await client.query("update public.profiles set role = 'super_admin' where id = $1 and role <> 'super_admin'", [id]);
      await client.query("insert into public.audit_logs (action, entity_type, entity_id, new_values) values ('super_admin_provisioned', 'profiles', $1, '{\"via\":\"vercel build\"}')", [id]);
      console.log(`[provision] ${email} is a super administrator.`);
    }
  }
  await client.end();
  console.log("[migrate] database up to date.");
}
execSync("npx --no-install next build", { stdio: "inherit" });
