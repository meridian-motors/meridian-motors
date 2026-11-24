import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, serverEnv } from "@/lib/env";

const body = z.object({ listingId: z.uuid(), event: z.enum(["view", "gallery_open", "share"]) });
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse/i;

/** Records listing analytics. Views are de-duplicated per anonymous daily session hash. */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured) return new NextResponse(null, { status: 204 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || BOT.test(req.headers.get("user-agent") ?? "")) return new NextResponse(null, { status: 204 });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const day = new Date().toISOString().slice(0, 10);
  const sessionHash = crypto.createHash("sha256").update(`${serverEnv().sessionHashSalt}:${ip}:${req.headers.get("user-agent") ?? ""}:${day}`).digest("hex").slice(0, 40);
  const supabase = await createClient();
  await supabase.rpc("record_listing_event", { p_listing: parsed.data.listingId, p_event: parsed.data.event, p_session_hash: sessionHash });
  return new NextResponse(null, { status: 204 });
}
