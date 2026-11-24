"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";

/** A button that runs a server action, shows pending state and surfaces errors. */
export function ActionButton({ action, children, confirmText, redirectTo, ...props }: ButtonProps & {
  action: () => Promise<ActionResult<unknown>>; confirmText?: string; redirectTo?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <Button {...props} disabled={pending || props.disabled} onClick={() => {
        if (confirmText && !confirm(confirmText)) return;
        start(async () => {
          setError(null);
          const r = await action();
          if (!r.ok) setError(r.error);
          else if (r.data && typeof r.data === "object" && "url" in r.data) window.location.href = String((r.data as { url: string }).url);
          else if (redirectTo) router.push(redirectTo);
          router.refresh();
        });
      }}>{pending ? <Loader2 className="animate-spin" /> : null}{children}</Button>
      {error ? <span role="alert" className="mt-1 max-w-xs text-[12px] text-danger">{error}</span> : null}
    </span>
  );
}
