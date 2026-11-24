import * as React from "react";
import { cn } from "@/lib/utils";

export const fieldBase =
  "w-full rounded-[var(--radius-sm)] border border-line bg-white px-3 text-sm text-ink placeholder:text-muted/80 transition-colors focus:border-charcoal focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-mist disabled:text-muted aria-[invalid=true]:border-danger";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input ref={ref} type={type} className={cn(fieldBase, "h-10", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 4, ...props }, ref) => (
    <textarea ref={ref} rows={rows} className={cn(fieldBase, "py-2.5 leading-relaxed", className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        fieldBase,
        "h-10 appearance-none bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2385898d' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")] bg-[length:12px] bg-[right_0.75rem_center] bg-no-repeat pr-9",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-[13px] font-medium text-charcoal", className)} {...props} />;
}

export function FieldError({ message, id }: { message?: string; id?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-[12.5px] text-danger">
      {message}
    </p>
  );
}

export function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{children}</p>;
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-accent">*</span> : null}
      </Label>
      {children}
      {error ? <FieldError message={error} id={`${htmlFor}-error`} /> : hint ? <FieldHint>{hint}</FieldHint> : null}
    </div>
  );
}

export function Checkbox({
  className,
  label,
  description,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode; description?: React.ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 text-sm", className)}>
      <input
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded-[2px] border-line accent-ink"
        {...props}
      />
      <span>
        <span className="text-charcoal">{label}</span>
        {description ? <span className="mt-0.5 block text-[12.5px] text-muted">{description}</span> : null}
      </span>
    </label>
  );
}
