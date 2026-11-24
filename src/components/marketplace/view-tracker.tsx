"use client";
import { useEffect } from "react";

export function ViewTracker({ listingId }: { listingId: string }) {
  useEffect(() => {
    const t = setTimeout(() => {
      fetch("/api/listings/view", { method: "POST", body: JSON.stringify({ listingId, event: "view" }), headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [listingId]);
  return null;
}
