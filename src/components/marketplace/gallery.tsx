"use client";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import { VehicleImage } from "./vehicle-card";
import { IMAGE_TYPE_LABELS } from "@/lib/constants";
import type { ImageType } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Gallery({ images, alt, listingId }: { images: { url: string; type: ImageType }[]; alt: string; listingId: string }) {
  const [i, setI] = useState(0);
  const [full, setFull] = useState(false);
  const n = images.length;
  const go = useCallback((d: number) => setI((x) => (x + d + n) % n), [n]);
  useEffect(() => {
    if (!full) return;
    fetch("/api/listings/view", { method: "POST", body: JSON.stringify({ listingId, event: "gallery_open" }), headers: { "content-type": "application/json" } }).catch(() => {});
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(false); if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [full, go, listingId]);

  if (!n) return <div className="relative aspect-[16/10] overflow-hidden rounded-[var(--radius-md)] border border-line"><VehicleImage src={null} alt={alt} sizes="100vw" /></div>;

  return (
    <div>
      <div className="group relative aspect-[16/10] overflow-hidden rounded-[var(--radius-md)] bg-ink">
        <Image src={images[i].url} alt={`${alt} — ${IMAGE_TYPE_LABELS[images[i].type]} (${i + 1} of ${n})`} fill priority sizes="(min-width:1024px) 60vw, 100vw" className="object-cover" />
        {n > 1 ? (
          <>
            <button onClick={() => go(-1)} aria-label="Previous photo" className="absolute left-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"><ChevronLeft className="size-5" /></button>
            <button onClick={() => go(1)} aria-label="Next photo" className="absolute right-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"><ChevronRight className="size-5" /></button>
          </>
        ) : null}
        <button onClick={() => setFull(true)} className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-ink/75 px-3 py-1.5 text-[12px] font-medium text-white backdrop-blur hover:bg-ink">
          <Expand className="size-3.5" /> {i + 1} / {n}
        </button>
      </div>
      {n > 1 ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((img, idx) => (
            <button key={img.url} onClick={() => setI(idx)} aria-label={`Show photo ${idx + 1}`} aria-current={idx === i}
              className={cn("relative h-16 w-24 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border-2 transition-colors", idx === i ? "border-ink" : "border-transparent opacity-75 hover:opacity-100")}>
              <Image src={img.url} alt="" fill sizes="96px" className="object-cover" />
            </button>
          ))}
        </div>
      ) : null}
      {full ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-ink/97" role="dialog" aria-modal="true" aria-label="Photo gallery">
          <div className="flex items-center justify-between px-5 py-4 text-white">
            <p className="text-[13px] text-white/70">{IMAGE_TYPE_LABELS[images[i].type]} · {i + 1} of {n}</p>
            <button onClick={() => setFull(false)} aria-label="Close gallery" className="rounded-full p-2 hover:bg-white/10"><X className="size-5" /></button>
          </div>
          <div className="relative flex-1">
            <Image src={images[i].url} alt={`${alt} — photo ${i + 1}`} fill sizes="100vw" className="object-contain" />
            <button onClick={() => go(-1)} aria-label="Previous photo" className="absolute left-4 top-1/2 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"><ChevronLeft /></button>
            <button onClick={() => go(1)} aria-label="Next photo" className="absolute right-4 top-1/2 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"><ChevronRight /></button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
