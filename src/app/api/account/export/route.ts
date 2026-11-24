import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** UK GDPR data portability: a JSON export of the signed-in user's own data (RLS-scoped). */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const supabase = await createClient();
  const tables = ["profiles", "sellers", "buyers", "buyer_preferences", "saved_vehicles", "saved_searches", "vehicles", "vehicle_sale_terms", "listings",
    "valuations", "price_recommendations", "price_history", "enquiries", "enquiry_contacts", "messages", "transactions", "payments", "service_orders",
    "notifications", "notification_preferences", "consent_records", "data_requests", "assistance_requests"] as const;
  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), account: session.email };
  for (const t of tables) {
    const { data } = await supabase.from(t).select("*").limit(5000);
    out[t] = data ?? [];
  }
  await supabase.rpc("log_audit", { p_action: "data_export", p_entity_type: "profiles", p_entity_id: session.userId, p_details: null });
  return new NextResponse(JSON.stringify(out, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="meridian-motors-data-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" },
  });
}
