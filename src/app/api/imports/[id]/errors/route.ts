import { NextResponse, type NextRequest } from "next/server";
import { getSession, isAdminRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/imports/parse";

/** Downloadable error report: every invalid, duplicate or failed row with its original data. */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session || !isAdminRole(session.profile.role)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const supabase = await createClient();
  const { data: rows } = await supabase.from("import_rows").select("row_number, processing_status, validation_errors, last_error, raw_data").eq("import_job_id", id).in("processing_status", ["invalid", "duplicate", "failed"]).order("row_number").limit(10000);
  const rawCols = [...new Set((rows ?? []).flatMap((r) => Object.keys(r.raw_data as object)))];
  const out = (rows ?? []).map((r) => ({ row: r.row_number, status: r.processing_status, issues: [...(r.validation_errors ?? []), r.last_error].filter(Boolean).join("; "), ...(r.raw_data as object) }));
  return new NextResponse(toCsv(out, ["row", "status", "issues", ...rawCols]), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="import-${id.slice(0, 8)}-errors.csv"` } });
}
