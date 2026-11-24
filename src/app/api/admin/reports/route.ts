import { NextResponse, type NextRequest } from "next/server";
import { getSession, isStaffRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/imports/parse";

const METRICS = ["listing_views", "saves", "enquiries", "new_listings", "completed_sales", "revenue", "registrations", "ai_cost"];

/** CSV export of daily recorded metrics (staff only). */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !isStaffRole(session.profile.role)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const from = re.test(req.nextUrl.searchParams.get("from") ?? "") ? req.nextUrl.searchParams.get("from")! : new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const to = re.test(req.nextUrl.searchParams.get("to") ?? "") ? req.nextUrl.searchParams.get("to")! : new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  const results = await Promise.all(METRICS.map((m) => supabase.rpc("admin_timeseries", { p_metric: m, p_from: from, p_to: `${to}T23:59:59Z` })));
  const rows: Record<string, unknown>[] = ((results[0].data ?? []) as { day: string }[]).map((d, i) => ({ day: d.day, ...Object.fromEntries(METRICS.map((m, j) => [m, (results[j].data as { value: number }[])?.[i]?.value ?? 0])) }));
  await supabase.rpc("log_audit", { p_action: "report_export", p_entity_type: "analytics", p_entity_id: null, p_details: { from, to } });
  return new NextResponse(toCsv(rows, ["day", ...METRICS]), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="meridian-metrics-${from}-to-${to}.csv"`, "Cache-Control": "no-store" } });
}
