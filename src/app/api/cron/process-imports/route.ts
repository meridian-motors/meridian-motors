import { NextResponse, type NextRequest } from "next/server";
import { isAuthorisedCron } from "@/lib/cron";
import { createAdminClient } from "@/lib/supabase/admin";
import { processBatch } from "@/lib/imports/process";

export const maxDuration = 60;

/** Background worker: continues queued/processing imports even when no admin has the page open. */
export async function GET(req: NextRequest) {
  if (!isAuthorisedCron(req)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const admin = createAdminClient();
  const { data: jobs } = await admin.from("import_jobs").select("id").in("job_status", ["queued", "processing"]).order("created_at").limit(3);
  const started = Date.now();
  const results: Record<string, number> = {};
  for (const j of jobs ?? []) {
    results[j.id] = 0;
    while (Date.now() - started < 45_000) {
      const r = await processBatch(admin, j.id, 50);
      results[j.id] += r.processed;
      if (r.done || ("busy" in r && r.busy)) break;
    }
  }
  return NextResponse.json({ processed: results });
}
