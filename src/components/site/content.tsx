import { AlertTriangle } from "lucide-react";

export function ContentHero({ eyebrow, title, intro }: { eyebrow: string; title: string; intro?: string }) {
  return (
    <section className="border-b border-line bg-white">
      <div className="container-page py-16 lg:py-20">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-3 max-w-3xl text-[36px] font-semibold leading-tight sm:text-[44px]">{title}</h1>
        {intro ? <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-slate">{intro}</p> : null}
      </div>
    </section>
  );
}

export function LegalDocument({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="container-page py-14">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex gap-3 rounded-[var(--radius-sm)] border border-warning/25 bg-warning-soft p-4 text-[13.5px] text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p><strong>Draft for legal review.</strong> This document is a working draft prepared to describe how the platform operates. It has not been approved by a qualified legal professional and must be reviewed before Meridian Motors launches to the public. Sections marked [LEGAL REVIEW] require particular attention.</p>
        </div>
        <p className="eyebrow">Legal</p>
        <h1 className="mt-2 text-[34px] font-semibold">{title}</h1>
        <p className="mt-2 text-[13px] text-muted">Draft version {updated}</p>
        <div className="prose-meridian mt-10">{children}</div>
      </div>
    </div>
  );
}
