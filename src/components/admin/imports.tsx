"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { uploadImport, applyMapping, startImport, runImportBatch, retryFailed, cancelImport, toggleRow } from "@/app/actions/imports";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Select } from "@/components/ui/input";
import { FIELD_LABELS, IMPORT_FIELDS, REQUIRED_FIELDS, type ImportField } from "@/lib/imports/detect";
import type { ActionResult } from "@/lib/action-result";

export function UploadForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(uploadImport, null);
  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <input type="file" name="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required className="text-[13px] file:mr-3 file:rounded-[var(--radius-sm)] file:border file:border-line file:bg-white file:px-3 file:py-2 file:text-[13px]" />
      <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Upload />}Upload &amp; detect columns</Button>
      {state && !state.ok ? <p className="text-[13px] text-danger">{state.error}</p> : null}
    </form>
  );
}

export function MappingForm({ jobId, headers, initial, locked }: { jobId: string; headers: string[]; initial: Partial<Record<ImportField, string>>; locked: boolean }) {
  const router = useRouter();
  const [mapping, setMapping] = useState(initial);
  const [res, setRes] = useState<ActionResult<{ valid: number; invalid: number; duplicates: number }> | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {IMPORT_FIELDS.map((f) => (
          <label key={f} className="text-[13px]"><span className="mb-1 block font-medium">{FIELD_LABELS[f]}{REQUIRED_FIELDS.includes(f) ? <span className="text-accent"> *</span> : null}</span>
            <Select disabled={locked} value={mapping[f] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [f]: e.target.value || undefined }))} className={initial[f] ? "border-success/50" : ""}>
              <option value="">— not mapped —</option>{headers.map((h) => <option key={h} value={h}>{h}</option>)}
            </Select></label>
        ))}
      </div>
      {!locked ? <Button className="mt-5" disabled={pending} onClick={() => start(async () => { setRes(await applyMapping(jobId, mapping)); router.refresh(); })}>{pending ? <Loader2 className="animate-spin" /> : null}Validate &amp; preview</Button> : null}
      {res ? <Alert tone={res.ok ? "success" : "danger"} className="mt-4">{res.ok ? `${res.data!.valid} valid · ${res.data!.invalid} invalid · ${res.data!.duplicates} duplicates. Review below, then start the import.` : res.error}</Alert> : null}
    </div>
  );
}

export function ImportRunner({ jobId, status, selected, processed, total }: { jobId: string; status: string; selected: number; processed: number; total: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);
  const [pending, start] = useTransition();
  const loop = async () => {
    setRunning(true); stop.current = false; setError(null);
    while (!stop.current) {
      const r = await runImportBatch(jobId);
      router.refresh();
      if (!r.ok) { setError(r.error); break; }
      if (r.data?.done) break;
    }
    setRunning(false); router.refresh();
  };
  useEffect(() => { if (status === "processing" || status === "queued") void loop(); return () => { stop.current = true; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pct = selected ? Math.min(100, Math.round((processed / selected) * 100)) : 0;
  return (
    <div className="space-y-4">
      {["queued", "processing"].includes(status) || running ? (
        <div><div className="flex justify-between text-[13px]"><span>{running ? "Importing in batches of 50…" : "Queued — the background worker will continue if you leave this page."}</span><span>{processed} / {selected} ({pct}%)</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-mist"><div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} /></div></div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {status === "previewed" ? <Button disabled={pending || !selected} onClick={() => start(async () => { const r = await startImport(jobId); if (!r.ok) setError(r.error); else void loop(); })}>Start import of {selected} vehicles</Button> : null}
        {["queued", "processing"].includes(status) && !running ? <Button onClick={() => void loop()}>Resume processing</Button> : null}
        {status === "completed_with_errors" ? <Button variant="secondary" onClick={() => start(async () => { await retryFailed(jobId); void loop(); })}>Retry failed rows</Button> : null}
        {["mapping", "previewed", "queued", "processing"].includes(status) ? <Button variant="ghost" onClick={() => { stop.current = true; start(async () => { await cancelImport(jobId); router.refresh(); }); }}>Cancel</Button> : null}
        <Button asChild variant="secondary"><a href={`/api/imports/${jobId}/errors`}>Download error report</a></Button>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <p className="text-[12px] text-muted">{total} rows in file. Imported vehicles are created as drafts and must be reviewed, priced and approved before publication.</p>
    </div>
  );
}

export function RowToggle({ rowId, selected, disabled }: { rowId: string; selected: boolean; disabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <input type="checkbox" aria-label="Include row" className="accent-ink" checked={selected} disabled={disabled || pending} onChange={(e) => start(async () => { await toggleRow(rowId, e.target.checked); router.refresh(); })} />;
}
