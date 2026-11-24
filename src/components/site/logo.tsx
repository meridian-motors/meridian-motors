import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)} fill="none">
      <circle cx="16" cy="16" r="14.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 1.75v28.5" stroke="#A88C63" strokeWidth="1.5" />
      <path d="M4.5 20.5c3.2-2.4 7-3.6 11.5-3.6s8.3 1.2 11.5 3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ inverse = false, className }: { inverse?: boolean; className?: string }) {
  return (
    <Link href="/" className={cn("group inline-flex items-center gap-2.5", inverse ? "text-white" : "text-ink", className)} aria-label="Meridian Motors home">
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="font-[family-name:var(--font-display)] text-[15px] font-semibold tracking-[0.24em]">MERIDIAN</span>
        <span className="mt-1 text-[9px] font-medium tracking-[0.42em] text-accent">MOTORS</span>
      </span>
    </Link>
  );
}
