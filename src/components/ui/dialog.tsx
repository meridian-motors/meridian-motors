"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  side,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  side?: "right" | "bottom";
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px] data-[state=open]:animate-in" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex max-h-[92vh] flex-col bg-white shadow-[var(--shadow-lift)] focus:outline-none",
          side === "right"
            ? "inset-y-0 right-0 h-full max-h-none w-full max-w-md"
            : side === "bottom"
              ? "inset-x-0 bottom-0 w-full rounded-t-[var(--radius-lg)]"
              : "left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-md)]",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <DialogPrimitive.Title className="text-base font-semibold text-ink">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-0.5 text-[13px] text-muted">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close className="rounded-[var(--radius-sm)] p-1 text-muted hover:bg-mist hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
