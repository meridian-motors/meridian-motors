import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Records cookie consent against signed-in accounts (anonymous choices live only in the consent cookie). */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { analytics?: boolean };
  const session = await getSession();
  if (session) {
    const supabase = await createClient();
    await supabase.from("consent_records").insert({ profile_id: session.userId, consent_type: "cookies_analytics", granted: !!body.analytics, policy_version: "2026-11" });
  }
  return new NextResponse(null, { status: 204 });
}
