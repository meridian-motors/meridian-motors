import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * Approximate location for distance search. Uses the postcode DISTRICT only
 * (e.g. "SW1A"), so precise addresses are never sent or stored.
 * Source: postcodes.io (open data, Ordnance Survey / ONS).
 */
const cache = new Map<string, { lat: number; lng: number } | null>();

export function outcode(postcode: string | null | undefined) {
  const p = (postcode ?? "").toUpperCase().replace(/\s+/g, "");
  const m = p.match(/^([A-Z]{1,2}[0-9][A-Z0-9]?)([0-9][A-Z]{2})?$/);
  return m ? m[1] : null;
}

export async function geocodeOutcode(postcode: string | null | undefined): Promise<{ lat: number; lng: number } | null> {
  const oc = outcode(postcode);
  if (!oc || !serverEnv().geocodingEnabled) return null;
  if (cache.has(oc)) return cache.get(oc)!;
  try {
    const res = await fetch(`https://api.postcodes.io/outcodes/${encodeURIComponent(oc)}`, { signal: AbortSignal.timeout(4000), next: { revalidate: 86400 * 30 } });
    if (!res.ok) { cache.set(oc, null); return null; }
    const json = (await res.json()) as { result?: { latitude: number; longitude: number } };
    const val = json.result ? { lat: Number(json.result.latitude.toFixed(4)), lng: Number(json.result.longitude.toFixed(4)) } : null;
    cache.set(oc, val);
    return val;
  } catch {
    return null;
  }
}
