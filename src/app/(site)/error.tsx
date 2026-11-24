"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function SiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="container-page flex min-h-[50vh] flex-col items-center justify-center py-20 text-center">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="mt-3 text-2xl font-semibold">We couldn&apos;t load this page</h1>
      <p className="mt-2 max-w-md text-[14px] text-muted">Please try again. If the problem continues, contact our support team{error.digest ? ` quoting reference ${error.digest}` : ""}.</p>
      <Button className="mt-6" onClick={reset}>Try again</Button>
    </div>
  );
}
