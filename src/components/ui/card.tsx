import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-md)] border border-line bg-white", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-line px-5 py-4", className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
        {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-5", className)} {...props} />;
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "default" | "accent";
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="eyebrow">{label}</p>
        {icon ? <span className={cn("text-silver [&_svg]:size-4", tone === "accent" && "text-accent")}>{icon}</span> : null}
      </div>
      <p className="mt-3 font-[family-name:var(--font-display)] text-[28px] font-semibold leading-none tracking-[-0.03em] text-ink tabular-nums">
        {value}
      </p>
      {hint ? <p className="mt-2 text-[12.5px] text-muted">{hint}</p> : null}
    </Card>
  );
}
