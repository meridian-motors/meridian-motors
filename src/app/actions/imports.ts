"use server";
import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession, isAdminRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { parseCsv, parseXlsx, MAX_IMPORT_BYTES } from "@/lib/imports/parse";
import { detectColumns, IMPORT_FIELDS, REQUIRED_FIELDS, type ImportField } from "@/lib/imports/detect";
import { previewJob, processBatch } from "@/lib/imports/process";

async function admin() {
  const s = await getSession();
  if (!s || !isAdminRole(s.profile.role)) throw new Error("Not permitted");
  return { session: s, db: createAdminClient() };
}

export async function uploadImport(_: unknown, formData: FormData): Promise<ActionResult> {
  let jobId: string;
  try {
    const { session, db } = await admin();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return fail("Choose a CSV or XLSX file.");
    if (file.size > MAX_IMPORT_BYTES) return fail("Files must be 20MB or smaller.");
    const ext = file.name.toLowerCase().split(".").pop();
    if (ext !== "csv" && ext !== "xlsx") return fail("Only .csv and .xlsx files are supported.");
    const buf = await file.arrayBuffer();
    const hash = crypto.createHash("sha256").update(Buffer.from(buf)).digest("hex");
    let sheet;
    try { sheet = ext === "csv" ? parseCsv(new TextDecoder("utf-8").decode(buf)) : await parseXlsx(buf); }
    catch { return fail("The file could not be read. Check it is a valid CSV or Excel workbook."); }
    if (!sheet.rows.length) return fail("No data rows were found in the file.");
    const { data: maxRows } = await db.from("platform_settings").select("setting_value").eq("setting_key", "imports.max_rows").maybeSingle();
    if (sheet.rows.length > Number(maxRows?.setting_value ?? 5000)) return fail(`This file has ${sheet.rows.length} rows; the limit is ${maxRows?.setting_value ?? 5000}. Split it into smaller files.`);
    const detection = detectColumns(sheet.headers);
    const { data: job, error } = await db.from("import_jobs").insert({
      uploaded_by: session.userId, file_name: file.name.slice(0, 200), file_type: ext, file_hash: hash, total_rows: sheet.rows.length,
      column_mapping: detection.mapping, job_status: "mapping",
    }).select("id").single();
    if (error || !job) return fail("Could not create the import job.");
    jobId = job.id;
    await db.storage.from("import-files").upload(`${job.id}/${hash}.${ext}`, Buffer.from(buf), { contentType: ext === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const rows = sheet.rows.map((r, i) => ({ import_job_id: job.id, row_number: i + 2, raw_data: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? null : String(v).slice(0, 6000)])) }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error: rErr } = await db.from("import_rows").insert(rows.slice(i, i + 500));
      if (rErr) { await db.from("import_jobs").update({ job_status: "failed", error_message: rErr.message }).eq("id", job.id); return fail("Could not store the rows."); }
    }
    await db.rpc("log_audit", { p_action: "import_uploaded", p_entity_type: "import_jobs", p_entity_id: job.id, p_details: { file: file.name, rows: rows.length } });
  } catch (e) {
    return fail((e as Error).message === "Not permitted" ? "Only administrators can import vehicles." : "Upload failed.");
  }
  redirect(`/admin/imports/${jobId}`);
}

export async function applyMapping(jobId: string, mapping: Partial<Record<ImportField, string>>): Promise<ActionResult<{ valid: number; invalid: number; duplicates: number }>> {
  try {
    const { db } = await admin();
    const clean = Object.fromEntries(Object.entries(mapping).filter(([k, v]) => (IMPORT_FIELDS as readonly string[]).includes(k) && v)) as Partial<Record<ImportField, string>>;
    const missing = REQUIRED_FIELDS.filter((f) => !clean[f]);
    if (missing.length) return fail(`Map the required columns: ${missing.join(", ")}.`);
    const counts = await previewJob(db, jobId, clean);
    revalidatePath(`/admin/imports/${jobId}`);
    return ok(counts);
  } catch (e) { return fail((e as Error).message); }
}

export async function toggleRow(rowId: string, selected: boolean): Promise<ActionResult> {
  try {
    const { db } = await admin();
    const { data: row } = await db.from("import_rows").select("import_job_id, processing_status").eq("id", rowId).single();
    if (!row || row.processing_status !== "pending") return fail("Only valid, unprocessed rows can be selected.");
    await db.from("import_rows").update({ selected }).eq("id", rowId);
    const { count } = await db.from("import_rows").select("id", { count: "exact", head: true }).eq("import_job_id", row.import_job_id).eq("selected", true).eq("processing_status", "pending");
    await db.from("import_jobs").update({ selected_rows: count ?? 0 }).eq("id", row.import_job_id);
    revalidatePath(`/admin/imports/${row.import_job_id}`);
    return ok();
  } catch (e) { return fail((e as Error).message); }
}

export async function startImport(jobId: string): Promise<ActionResult> {
  try {
    const { db } = await admin();
    const { data: job } = await db.from("import_jobs").select("job_status, selected_rows").eq("id", jobId).single();
    if (!job || job.job_status !== "previewed") return fail("Preview the import before starting it.");
    if (!job.selected_rows) return fail("No valid rows are selected.");
    await db.from("import_jobs").update({ job_status: "queued" }).eq("id", jobId);
    revalidatePath(`/admin/imports/${jobId}`);
    return ok();
  } catch (e) { return fail((e as Error).message); }
}

export async function runImportBatch(jobId: string): Promise<ActionResult<{ done: boolean }>> {
  try {
    const { db } = await admin();
    const r = await processBatch(db, jobId, 50);
    return ok({ done: r.done });
  } catch (e) { return fail((e as Error).message); }
}

export async function retryFailed(jobId: string): Promise<ActionResult> {
  try {
    const { db } = await admin();
    await db.from("import_rows").update({ processing_status: "pending", last_error: null }).eq("import_job_id", jobId).eq("processing_status", "failed");
    await db.from("import_jobs").update({ job_status: "queued", completed_at: null }).eq("id", jobId);
    revalidatePath(`/admin/imports/${jobId}`);
    return ok();
  } catch (e) { return fail((e as Error).message); }
}

export async function cancelImport(jobId: string): Promise<ActionResult> {
  try {
    const { db } = await admin();
    await db.from("import_jobs").update({ job_status: "cancelled" }).eq("id", jobId).in("job_status", ["mapping", "previewed", "queued", "processing"]);
    revalidatePath(`/admin/imports/${jobId}`);
    return ok();
  } catch (e) { return fail((e as Error).message); }
}
