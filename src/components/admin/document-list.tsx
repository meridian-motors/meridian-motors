"use client";
import { useState } from "react";
import { ExternalLink, FileText } from "lucide-react";
import { getDocumentUrl } from "@/app/actions/seller";
import { formatDate } from "@/lib/format";

export function DocumentList({ documents }: { documents: { id: string; label: string; file_name: string; created_at: string; access_level: string }[] }) {
  const [error, setError] = useState<string | null>(null);
  if (!documents.length) return null;
  return (
    <>
      <ul className="divide-y divide-line rounded-[var(--radius-sm)] border border-line">
        {documents.map((d) => (
          <li key={d.id} className="flex items-center gap-3 px-4 py-3 text-[13.5px]">
            <FileText className="size-4 text-silver" />
            <span className="min-w-0 flex-1"><span className="block font-medium">{d.label}</span><span className="block truncate text-[12px] text-muted">{d.file_name} · {formatDate(d.created_at)} · {d.access_level.replace(/_/g, " ")}</span></span>
            <button className="flex items-center gap-1 text-[13px] underline" onClick={async () => { const r = await getDocumentUrl(d.id); if (r.ok && r.data) window.open(r.data.url, "_blank", "noopener"); else if (!r.ok) setError(r.error); }}>Open<ExternalLink className="size-3.5" /></button>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-2 text-[13px] text-danger">{error}</p> : null}
    </>
  );
}
