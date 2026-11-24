import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { UploadForm } from "@/components/admin/imports";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Import centre" };

export default async function ImportsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("import_jobs").select("*").order("created_at", { ascending: false }).limit(100);
  return (
    <>
      <PageHeader eyebrow="Commercial" title="Import centre" description="Bulk-import vehicles from CSV or Excel. Columns are detected automatically; every row is validated and duplicates are flagged before anything is created." />
      <Card className="mb-8"><CardHeader title="Upload a file" description="CSV or XLSX, up to 20MB and 5,000 rows. Required columns: make, model, year, mileage." /><CardBody><UploadForm /></CardBody></Card>
      <Card><CardHeader title="Import history" /><Table><THead><tr><TH>File</TH><TH>Uploaded</TH><TH>Rows</TH><TH>Imported</TH><TH>Failed</TH><TH>Duplicates</TH><TH>Status</TH></tr></THead><TBody>
        {(data ?? []).map((j) => <TR key={j.id}><TD><Link href={`/admin/imports/${j.id}`} className="font-medium hover:underline">{j.file_name}</Link></TD><TD>{formatDateTime(j.created_at)}</TD><TD>{j.total_rows}</TD><TD>{j.imported_rows}</TD><TD>{j.failed_rows}</TD><TD>{j.duplicate_rows}</TD>
          <TD><Badge tone={j.job_status === "completed" ? "success" : j.job_status.includes("error") || j.job_status === "failed" ? "danger" : "info"}>{j.job_status.replace(/_/g, " ")}</Badge></TD></TR>)}
        {!(data ?? []).length ? <TR><TD colSpan={7} className="text-center text-muted">No imports yet.</TD></TR> : null}
      </TBody></Table></Card>
    </>
  );
}
