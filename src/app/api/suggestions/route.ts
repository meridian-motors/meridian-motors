import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 40);
  if (!isSupabaseConfigured || q.length < 2) return NextResponse.json([]);
  const supabase = await createClient();
  const { data } = await supabase.rpc("listing_suggestions", { p_prefix: q });
  return NextResponse.json(data ?? [], { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
