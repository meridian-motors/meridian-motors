"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export const CONSENT_COOKIE = "mm_consent";
export const CONSENT_VERSION = "2026-11";

/** UK GDPR / PECR: only strictly-necessary cookies are set until the visitor chooses. */
export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(!document.cookie.split("; ").some((c) => c.startsWith(`${CONSENT_COOKIE}=`)));
    const reopen = () => setVisible(true);
    window.addEventListener("mm:cookie-settings", reopen);
    return () => window.removeEventListener("mm:cookie-settings", reopen);
  }, []);
  const choose = (analytics: boolean) => {
    const value = encodeURIComponent(JSON.stringify({ v: CONSENT_VERSION, analytics, marketing: false, at: new Date().toISOString() }));
    document.cookie = `${CONSENT_COOKIE}=${value}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax; secure`;
    fetch("/api/consent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ analytics }) }).catch(() => {});
    setVisible(false);
  };
  if (!visible) return null;
  return (
    <div role="dialog" aria-live="polite" aria-label="Cookie preferences" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-3xl rounded-[var(--radius-md)] border border-line bg-white p-5 shadow-[var(--shadow-lift)] sm:inset-x-6 sm:bottom-6">
      <p className="text-[14px] font-semibold text-ink">Your privacy</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-slate">
        We use strictly necessary cookies to run Meridian Motors (for example to keep you signed in). With your permission we would also use analytics cookies to understand how the site is used. See our <Link href="/cookies" className="underline">cookie policy</Link>.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" size="sm" onClick={() => choose(false)}>Necessary only</Button>
        <Button size="sm" onClick={() => choose(true)}>Accept analytics</Button>
      </div>
    </div>
  );
}
