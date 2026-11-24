import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, StatCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { MappingForm, ImportRunner, RowToggle } from "@/components/admin/imports";
import { formatMileage, formatPrice } from "@/lib/format";
import type { ImportField } from "@/lib/imports/detect";

export const metadata = { title: "Import" };
const FILTERS = ["all", "pending", "invalid", "duplicate", "imported", "failed"] as const;

export default async function ImportJobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ show?: string; page?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  await requireAdmin();
  const supabase = await createClient();
  const { data: job } = await supabase.from("import_jobs").select("*").eq("id", id).maybeSingle();
  if (!job) notFound();
  const show = FILTERS.includes(sp.show as (typeof FILTERS)[number]) ? sp.show! : "all";
  const page = Math.max(1, Number(sp.page) || 1);
  let q = supabase.from("import_rows").select("*", { count: "exact" }).eq("import_job_id", id).order("row_number").range((page - 1) * 100, page * 100 - 1);
  if (show !== "all") q = q.eq("processing_status", show);
  const [{ data: rows, count }, { data: first }] = await Promise.all([q, supabase.from("import_rows").select("raw_data").eq("import_job_id", id).order("row_number").limit(1).maybeSingle()]);
  const headers = Object.keys((first?.raw_data as object) ?? {});
  const locked = !["mapping", "previewed"].includes(job.job_status);
  const missing = Object.values(rows ?? []).length && job.job_status !== "mapping";
  void missing;
  return (
    <>
      <PageHeader eyebrow="Import centre" title={job.file_name} description={<Badge tone="info">{job.job_status.replace(/_/g, " ")}</Badge>} actions={<Button asChild variant="secondary"><Link href="/admin/imports">All imports</Link></Button>} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Total rows" value={job.total_rows} /><StatCard label="Selected" value={job.selected_rows} /><StatCard label="Duplicates" value={job.duplicate_rows} />
        <StatCard label="Imported" value={job.imported_rows} /><StatCard label="Failed" value={job.failed_rows} />
      </div>
      <Card className="mb-6"><CardHeader title="1. Column mapping" description="Detected automatically where possible (green). Adjust any column manually." /><CardBody><MappingForm jobId={id} headers={headers} initial={job.column_mapping as Partial<Record<ImportField, string>>} locked={locked} /></CardBody></Card>
      {job.job_status !== "mapping" ? <Card className="mb-6"><CardHeader title="2. Import" /><CardBody><ImportRunner jobId={id} status={job.job_status} selected={job.selected_rows} processed={job.processed_rows} total={job.total_rows} /></CardBody></Card> : null}
      <Card><CardHeader title="Rows" description="Invalid rows are never silently discarded — fix them in the source file and re-import, or download the error report." action={
        <div className="flex flex-wrap gap-1">{FILTERS.map((f) => <Link key={f} href={`?show=${f}`} className={`rounded px-2 py-1 text-[12px] ${show === f ? "bg-ink text-white" : "text-slate hover:bg-mist"}`}>{f}</Link>)}</div>} />
        <Table><THead><tr><TH /><TH>Row</TH><TH>Vehicle</TH><TH>Reg</TH><TH>Mileage</TH><TH>Price</TH><TH>Status</TH><TH>Issues</TH></tr></THead><TBody>
          {(rows ?? []).map((r) => { const m = r.mapped_data as Record<string, string | number | null> | null; const raw = r.raw_data as Record<string, string>;
            return <TR key={r.id}><TD><RowToggle rowId={r.id} selected={r.selected && r.processing_status === "pending"} disabled={job.job_status !== "previewed" || r.processing_status !== "pending"} /></TD><TD>{r.row_number}</TD>
              <TD>{m ? `${m.year ?? "?"} ${m.make ?? "?"} ${m.model ?? "?"}` : Object.values(raw).slice(0, 3).join(" · ")}</TD><TD className="font-mono text-[12px]">{m?.registration_number ?? "—"}</TD><TD>{m ? formatMileage(m.mileage as number) : "—"}</TD><TD>{m ? formatPrice(m.asking_price as number) : "—"}</TD>
              <TD><Badge tone={r.processing_status === "imported" ? "success" : ["invalid", "failed"].includes(r.processing_status) ? "danger" : r.processing_status === "duplicate" ? "warning" : "neutral"}>{r.processing_status}</Badge></TD>
              <TD className="max-w-md text-[12px] text-danger">{[...(r.validation_errors ?? []), r.last_error].filter(Boolean).join("; ")}{r.vehicle_id ? <Link className="text-ink underline" href={`/admin/inventory/${r.vehicle_id}`}>Open vehicle</Link> : null}</TD></TR>; })}
        </TBody></Table>
        {(count ?? 0) > 100 ? <div className="flex justify-between px-5 py-3 text-[13px]">{page > 1 ? <Link href={`?show=${show}&page=${page - 1}`}>← Previous</Link> : <span />}<span className="text-muted">Page {page} of {Math.ceil((count ?? 0) / 100)}</span>{page * 100 < (count ?? 0) ? <Link href={`?show=${show}&page=${page + 1}`}>Next →</Link> : <span />}</div> : null}
      </Card>
    </>
  );
}
