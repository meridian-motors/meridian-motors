"use client";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <html lang="en-GB"><body style={{ fontFamily: "system-ui", background: "#F7F7F4", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
      <div style={{ textAlign: "center", padding: 24 }}>
        <h1 style={{ fontSize: 24 }}>Something went wrong</h1>
        <p style={{ color: "#85898D" }}>Please try again.{error.digest ? ` Reference: ${error.digest}` : ""}</p>
        <button onClick={reset} style={{ marginTop: 16, background: "#0D0F10", color: "#fff", border: 0, padding: "10px 18px", cursor: "pointer" }}>Try again</button>
      </div>
    </body></html>
  );
}
