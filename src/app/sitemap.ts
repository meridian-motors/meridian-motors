import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { publicEnv, isSupabaseConfigured } from "@/lib/env";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicEnv.siteUrl;
  const pages = ["", "/cars", "/sell", "/how-it-works", "/about", "/contact", "/help", "/privacy", "/terms", "/cookies"].map((p) => ({
    url: `${base}${p}`, changeFrequency: (p === "/cars" || p === "" ? "hourly" : "monthly") as "hourly" | "monthly", priority: p === "" ? 1 : p === "/cars" ? 0.9 : 0.5,
  }));
  if (!isSupabaseConfigured) return pages;
  // Anonymous client: the sitemap can only ever contain public, published listings.
  const supabase = createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, { auth: { persistSession: false } });
  const data: { slug: string; published_at: string; make: string; model: string }[] = [];
  for (let from = 0; from < 45000; ) {
    const { data: page } = await supabase.from("public_listings").select("slug, published_at, make, model").order("published_at", { ascending: false }).range(from, from + 999);
    if (!page?.length) break;
    data.push(...page);
    from += page.length;
  }
  const models = new Map<string, string>();
  data.forEach((l) => models.set(`${l.make}|${l.model}`, l.published_at));
  return [
    ...pages,
    ...[...models.keys()].map((k) => { const [make, model] = k.split("|"); return { url: `${base}/cars?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`, changeFrequency: "daily" as const, priority: 0.7 }; }),
    ...data.map((l) => ({ url: `${base}/cars/${l.slug}`, lastModified: l.published_at, changeFrequency: "daily" as const, priority: 0.8 })),
  ];
}
