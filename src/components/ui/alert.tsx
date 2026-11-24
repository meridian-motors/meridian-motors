import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const tones = {
  info: { cls: "border-info/20 bg-info-soft text-info", Icon: Info },
  success: { cls: "border-success/20 bg-success-soft text-success", Icon: CheckCircle2 },
  warning: { cls: "border-warning/20 bg-warning-soft text-warning", Icon: AlertTriangle },
  danger: { cls: "border-danger/20 bg-danger-soft text-danger", Icon: XCircle },
  neutral: { cls: "border-line bg-paper text-slate", Icon: Info },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
  action,
}: {
  tone?: keyof typeof tones;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  const { cls, Icon } = tones[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-[var(--radius-sm)] border px-4 py-3 text-[13.5px]", cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={cn("leading-relaxed", title && "mt-0.5 opacity-90")}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
