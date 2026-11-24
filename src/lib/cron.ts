import "server-only";
import type { NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export function isAuthorisedCron(req: NextRequest) {
  const secret = serverEnv().cronSecret;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}
