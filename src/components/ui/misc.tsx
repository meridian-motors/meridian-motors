import * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[var(--radius-sm)] bg-mist", className)} aria-hidden />;
}

export function Separator({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-line", className)} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {icon ? <div className="mb-4 flex size-11 items-center justify-center rounded-full border border-line bg-paper text-muted [&_svg]:size-5">{icon}</div> : null}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description ? <p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
        <h1 className="text-2xl font-semibold sm:text-[28px]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function DefinitionList({ items, className }: { items: { label: string; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-8 sm:grid-cols-2", className)}>
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 text-[13.5px]">
          <dt className="text-muted">{item.label}</dt>
          <dd className="text-right font-medium text-ink">{item.value ?? <span className="text-muted">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}
