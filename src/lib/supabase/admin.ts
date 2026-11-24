import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Service-role client. BYPASSES RLS — only use in trusted server code AFTER an
 * explicit authorisation check (or for system jobs: webhooks, cron, imports).
 */
export function createAdminClient() {
  const key = serverEnv().supabaseServiceRoleKey;
  if (!publicEnv.supabaseUrl || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  return createClient(publicEnv.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
