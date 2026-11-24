import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapRow, markDuplicates, type MappedVehicle } from "./validate";
import type { ImportField } from "./detect";

type Admin = ReturnType<typeof createAdminClient>;

/** Map + validate + duplicate-check every row of a job (no vehicles are created here). */
export async function previewJob(admin: Admin, jobId: string, mapping: Partial<Record<ImportField, string>>) {
  const rows: { id: string; row_number: number; raw_data: Record<string, unknown> }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from("import_rows").select("id, row_number, raw_data").eq("import_job_id", jobId).order("row_number").range(from, from + 999);
    if (!data?.length) break;
    rows.push(...(data as typeof rows));
    if (data.length < 1000) break;
  }
  const mapped = rows.map((r) => ({ ...mapRow(r.raw_data, mapping), rowNumber: r.row_number, raw: r.raw_data, id: r.id }));
  const regs = [...new Set(mapped.map((m) => m.data.registration_number).filter(Boolean))] as string[];
  const vins = [...new Set(mapped.map((m) => m.data.vin).filter(Boolean))] as string[];
  const existingRegs = new Set<string>(), existingVins = new Set<string>();
  for (let i = 0; i < regs.length; i += 300) {
    const { data } = await admin.from("vehicles").select("registration_number").in("registration_number", regs.slice(i, i + 300)).is("deleted_at", null).not("vehicle_status", "in", "(completed,withdrawn,rejected,cancelled)");
    data?.forEach((d) => existingRegs.add(d.registration_number));
  }
  for (let i = 0; i < vins.length; i += 300) {
    const { data } = await admin.from("vehicles").select("vin").in("vin", vins.slice(i, i + 300)).is("deleted_at", null).not("vehicle_status", "in", "(completed,withdrawn,rejected,cancelled)");
    data?.forEach((d) => existingVins.add(d.vin));
  }
  const withDup = markDuplicates(mapped.map((m) => ({ rowNumber: m.rowNumber, raw: m.raw, data: m.data, errors: m.errors })), { registrations: existingRegs, vins: existingVins });
  // Persist in chunks
  const updates = withDup.map((r, i) => ({
    id: mapped[i].id, import_job_id: jobId, row_number: r.rowNumber, raw_data: r.raw, mapped_data: r.data, validation_errors: r.errors,
    is_duplicate: !!r.duplicateOf, selected: r.errors.length === 0 && !r.duplicateOf,
    processing_status: r.errors.length ? "invalid" : r.duplicateOf ? "duplicate" : "pending", last_error: r.duplicateOf,
  }));
  for (let i = 0; i < updates.length; i += 500) {
    const { error } = await admin.from("import_rows").upsert(updates.slice(i, i + 500), { onConflict: "id" });
    if (error) throw new Error(error.message);
  }
  const counts = { valid: updates.filter((u) => u.processing_status === "pending").length, invalid: updates.filter((u) => u.processing_status === "invalid").length, duplicates: updates.filter((u) => u.is_duplicate).length };
  await admin.from("import_jobs").update({ column_mapping: mapping, job_status: "previewed", selected_rows: counts.valid, duplicate_rows: counts.duplicates, failed_rows: 0, processed_rows: 0, imported_rows: 0 }).eq("id", jobId);
  return counts;
}

/** Process one batch. Idempotent: each row creates at most one vehicle (unique index on import_row_id). */
export async function processBatch(admin: Admin, jobId: string, batchSize = 50) {
  const { data: job } = await admin.from("import_jobs").select("*").eq("id", jobId).single();
  if (!job || !["queued", "processing"].includes(job.job_status)) return { done: true, processed: 0 };
  // Simple lease so two workers don't hammer the same job
  if (job.locked_until && new Date(job.locked_until) > new Date()) return { done: false, processed: 0, busy: true };
  await admin.from("import_jobs").update({ job_status: "processing", started_at: job.started_at ?? new Date().toISOString(), locked_until: new Date(Date.now() + 60_000).toISOString() }).eq("id", jobId);

  const { data: rows, error } = await admin.rpc("claim_import_rows", { p_job: jobId, p_limit: batchSize });
  if (error) throw new Error(error.message);
  let imported = 0, failed = 0;
  for (const row of (rows ?? []) as { id: string; mapped_data: MappedVehicle; attempts: number }[]) {
    const d = row.mapped_data;
    try {
      const { data: v, error: vErr } = await admin.from("vehicles").insert({
        source: "import", import_job_id: jobId, created_by: job.uploaded_by, vehicle_status: "draft", submission_step: 8,
        registration_number: d.registration_number, vin: d.vin, make: d.make, model: d.model, derivative: d.derivative, year: d.year, mileage: d.mileage,
        fuel_type: d.fuel_type, transmission: d.transmission, body_type: d.body_type, colour: d.colour, engine_size: d.engine_size, doors: d.doors, seats: d.seats,
        location: d.location, postcode: d.postcode, description: d.description, condition: d.condition, service_history: d.service_history ?? "unknown",
        submission_data: { import_row_id: row.id },
      }).select("id").single();
      let vehicleId = v?.id as string | undefined;
      if (vErr) {
        if (vErr.code === "23505") {
          // Either already imported by a previous attempt (idempotent) or a duplicate registration.
          const { data: existing } = await admin.from("vehicles").select("id").eq("source", "import").filter("submission_data->>import_row_id", "eq", row.id).maybeSingle();
          if (existing) vehicleId = existing.id;
          else { await admin.from("import_rows").update({ processing_status: "duplicate", is_duplicate: true, last_error: "Duplicate registration or VIN (already live)", processed_at: new Date().toISOString() }).eq("id", row.id); failed++; continue; }
        } else throw new Error(vErr.message);
      }
      if (d.asking_price && vehicleId) {
        const { data: hasListing } = await admin.from("listings").select("id").eq("vehicle_id", vehicleId).is("deleted_at", null).maybeSingle();
        if (!hasListing) await admin.from("listings").insert({ vehicle_id: vehicleId, title: [d.year, d.make, d.model, d.derivative].filter(Boolean).join(" ").slice(0, 140), description: d.description, asking_price: d.asking_price, location: d.location });
      }
      await admin.from("import_rows").update({ processing_status: "imported", vehicle_id: vehicleId, processed_at: new Date().toISOString(), last_error: null }).eq("id", row.id);
      imported++;
    } catch (e) {
      await admin.from("import_rows").update({ processing_status: "failed", last_error: String((e as Error).message).slice(0, 500), processed_at: new Date().toISOString() }).eq("id", row.id);
      failed++;
    }
  }
  // Recount from source of truth
  const count = async (status: string) => (await admin.from("import_rows").select("id", { count: "exact", head: true }).eq("import_job_id", jobId).eq("selected", true).eq("processing_status", status)).count ?? 0;
  const [imp, fail, dup, pend, proc] = await Promise.all([count("imported"), count("failed"), count("duplicate"), count("pending"), count("processing")]);
  const done = pend === 0 && proc === 0;
  await admin.from("import_jobs").update({
    imported_rows: imp, failed_rows: fail, processed_rows: imp + fail + dup, locked_until: null,
    ...(done ? { job_status: fail ? "completed_with_errors" : "completed", completed_at: new Date().toISOString() } : {}),
  }).eq("id", jobId);
  return { done, processed: imported + failed };
}
