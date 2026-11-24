"use client";
import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, ImagePlus, Loader2, Star, Trash2, Upload, ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { recordImage, deleteImage, setPrimaryImage, reorderImages, recordDocument, deleteDocument, getDocumentUrl } from "@/app/actions/seller";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { DOCUMENT_TYPE_LABELS, IMAGE_TYPE_LABELS } from "@/lib/constants";
import type { DocumentType, ImageType } from "@/lib/types";
import { formatDate } from "@/lib/format";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

/** Resize to max 2000px and re-encode as WebP (~85%) in the browser before upload. Strips EXIF (incl. GPS). */
async function compressImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale), height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Compression failed"))), "image/webp", 0.85));
  return { blob, width, height };
}

export interface ImageRow { id: string; public_url: string; image_type: ImageType; is_primary: boolean; display_order: number }

export function ImageManager({ vehicleId, images, editable = true }: { vehicleId: string; images: ImageRow[]; editable?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<ImageType>("exterior");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const sorted = [...images].sort((a, b) => a.display_order - b.display_order);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    const supabase = createClient();
    let done = 0;
    for (const file of Array.from(files).slice(0, 20)) {
      if (!IMAGE_TYPES.includes(file.type)) { setError(`${file.name}: only JPEG, PNG or WebP photos are accepted.`); continue; }
      if (file.size > MAX_IMAGE_BYTES) { setError(`${file.name} is larger than 25MB.`); continue; }
      setBusy(`Uploading ${++done} of ${Math.min(files.length, 20)}…`);
      try {
        const { blob, width, height } = await compressImage(file);
        const path = `${vehicleId}/${crypto.randomUUID()}.webp`;
        const { error: upErr } = await supabase.storage.from("vehicle-images").upload(path, blob, { contentType: "image/webp", upsert: false, cacheControl: "31536000" });
        if (upErr) { setError(`Upload failed: ${upErr.message}`); continue; }
        const res = await recordImage({ vehicleId, path, imageType: type, width, height });
        if (!res.ok) setError(res.error);
      } catch {
        setError(`${file.name} could not be processed. Try a JPEG photo.`);
      }
    }
    setBusy(null);
    if (input.current) input.current.value = "";
    router.refresh();
  };

  const move = (id: string, dir: -1 | 1) => start(async () => {
    const ids = sorted.map((i) => i.id);
    const idx = ids.indexOf(id), j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    const r = await reorderImages(vehicleId, ids);
    if (!r.ok) setError(r.error);
    router.refresh();
  });

  return (
    <div>
      {editable ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-silver bg-paper p-5">
          <div className="flex gap-3 text-[13.5px] text-slate">
            <ImagePlus className="size-6 shrink-0 text-muted" strokeWidth={1.5} />
            <div>
              <p className="font-medium text-ink">Add photographs</p>
              <p className="text-muted">Choose what the photos show, then select files. Photos are resized and location data is removed before upload.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Select aria-label="Photo type" value={type} onChange={(e) => setType(e.target.value as ImageType)} className="sm:w-48">
            {Object.entries(IMAGE_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
          <Button type="button" onClick={() => input.current?.click()} disabled={!!busy}>{busy ? <Loader2 className="animate-spin" /> : <Upload />}{busy ?? "Select photos"}</Button>
          </div>
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-3 text-[13px] text-danger">{error}</p> : null}
      {sorted.length ? (
        <ul className={`mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 ${pending ? "opacity-60" : ""}`}>
          {sorted.map((img, i) => (
            <li key={img.id} className="group relative overflow-hidden rounded-[var(--radius-sm)] border border-line bg-white">
              <div className="relative aspect-[4/3]"><Image src={img.public_url} alt={IMAGE_TYPE_LABELS[img.image_type]} fill sizes="240px" className="object-cover" /></div>
              <div className="flex items-center justify-between gap-1 px-2 py-1.5 text-[11.5px]">
                <span className="truncate text-slate">{img.is_primary ? <strong className="text-accent-strong">Main · </strong> : null}{IMAGE_TYPE_LABELS[img.image_type]}</span>
                {editable ? (
                  <span className="flex shrink-0 items-center">
                    <button type="button" aria-label="Move earlier" disabled={i === 0} onClick={() => move(img.id, -1)} className="p-1 text-muted hover:text-ink disabled:opacity-30"><ArrowLeft className="size-3.5" /></button>
                    <button type="button" aria-label="Move later" disabled={i === sorted.length - 1} onClick={() => move(img.id, 1)} className="p-1 text-muted hover:text-ink disabled:opacity-30"><ArrowRight className="size-3.5" /></button>
                    {!img.is_primary ? <button type="button" aria-label="Make main photo" onClick={() => start(async () => { await setPrimaryImage(img.id); router.refresh(); })} className="p-1 text-muted hover:text-accent"><Star className="size-3.5" /></button> : null}
                    <button type="button" aria-label="Delete photo" onClick={() => { if (confirm("Delete this photo?")) start(async () => { const r = await deleteImage(img.id); if (!r.ok) setError(r.error); router.refresh(); }); }} className="p-1 text-muted hover:text-danger"><Trash2 className="size-3.5" /></button>
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const DOC_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export interface DocumentRow { id: string; document_type: DocumentType; file_name: string; size_bytes: number; created_at: string; access_level?: string }

export function DocumentManager({ vehicleId, documents, editable = true }: { vehicleId: string; documents: DocumentRow[]; editable?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<DocumentType>("service_record");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!DOC_MIME.includes(file.type)) return setError("Upload a PDF, JPEG, PNG or WebP file.");
    if (file.size > 15 * 1024 * 1024) return setError("Documents must be 15MB or smaller.");
    setBusy(true);
    const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1].replace("jpeg", "jpg");
    const path = `${vehicleId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await createClient().storage.from("vehicle-documents").upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) { setBusy(false); return setError(`Upload failed: ${upErr.message}`); }
    const res = await recordDocument({ vehicleId, path, documentType: type, fileName: file.name, mimeType: file.type as "application/pdf", size: file.size });
    if (!res.ok) setError(res.error);
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  };
  const open = async (id: string) => {
    const r = await getDocumentUrl(id);
    if (r.ok && r.data) window.open(r.data.url, "_blank", "noopener"); else if (!r.ok) setError(r.error);
  };
  return (
    <div>
      {editable ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select aria-label="Document type" value={type} onChange={(e) => setType(e.target.value as DocumentType)} className="sm:w-60">
            {Object.entries(DOCUMENT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
          <Button type="button" variant="secondary" onClick={() => input.current?.click()} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Upload />}Upload document</Button>
        </div>
      ) : null}
      <p className="mt-2 text-[12px] text-muted">Documents are stored privately. Only you and authorised Meridian staff can view them — they are never shown on your listing.</p>
      {error ? <p role="alert" className="mt-2 text-[13px] text-danger">{error}</p> : null}
      {documents.length ? (
        <ul className="mt-4 divide-y divide-line rounded-[var(--radius-sm)] border border-line bg-white">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3 text-[13.5px]">
              <FileText className="size-4 shrink-0 text-silver" />
              <div className="min-w-0 flex-1"><p className="truncate font-medium text-ink">{DOCUMENT_TYPE_LABELS[d.document_type]}</p><p className="truncate text-[12px] text-muted">{d.file_name} · {(d.size_bytes / 1024 / 1024).toFixed(1)}MB · {formatDate(d.created_at)}</p></div>
              <button type="button" onClick={() => open(d.id)} className="p-1.5 text-muted hover:text-ink" aria-label="Open document"><ExternalLink className="size-4" /></button>
              {editable ? <button type="button" onClick={async () => { if (confirm("Delete this document?")) { const r = await deleteDocument(d.id); if (!r.ok) setError(r.error); router.refresh(); } }} className="p-1.5 text-muted hover:text-danger" aria-label="Delete document"><Trash2 className="size-4" /></button> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
