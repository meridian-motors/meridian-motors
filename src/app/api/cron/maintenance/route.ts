import { NextResponse, type NextRequest } from "next/server";
import { isAuthorisedCron } from "@/lib/cron";
import { createAdminClient } from "@/lib/supabase/admin";

/** Daily: expire old listings and flag overdue enquiry follow-ups. */
export async function GET(req: NextRequest) {
  if (!isAuthorisedCron(req)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const admin = createAdminClient();
  const { data: expired } = await admin.rpc("expire_listings");
  const { count: overdue } = await admin.from("enquiry_activities").select("id", { count: "exact", head: true }).is("completed_at", null).lt("due_at", new Date().toISOString());
  await admin.from("rate_limits").delete().lt("window_start", new Date(Date.now() - 86400000).toISOString());
  return NextResponse.json({ expired_listings: expired ?? 0, overdue_followups: overdue ?? 0 });
}
