import "server-only";
import { headers } from "next/headers";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";

export async function clientKey() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  return crypto.createHash("sha256").update(`${serverEnv().sessionHashSalt}:${ip}`).digest("hex").slice(0, 32);
}

/** Database-backed fixed-window limiter (works across serverless instances). Fails open if unavailable. */
export async function rateLimit(bucket: string, limit: number, windowSeconds: number) {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("check_rate_limit", { p_bucket: bucket, p_limit: limit, p_window_seconds: windowSeconds });
    if (error) return true;
    return data === true;
  } catch {
    return true;
  }
}
