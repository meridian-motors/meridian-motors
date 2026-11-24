import Link from "next/link";
import Image from "next/image";
import { Car, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { scoreMatch, hasMeaningfulPreferences, normaliseWeights, type BuyerPreferenceInput } from "@/lib/matching/engine";
import { formatMileage, formatPercent, formatPrice } from "@/lib/format";

export const metadata = { title: "Recommended for you" };

export default async function RecommendationsPage() {
  await requireUser("/dashboard/recommendations");
  const supabase = await createClient();
  const [{ data: prefs }, { data: listings }, { data: weights }] = await Promise.all([
    supabase.from("buyer_preferences").select("*").maybeSingle(),
    supabase.from("public_listings").select("id, slug, vehicle_id, make, model, year, mileage, asking_price, fuel_type, transmission, body_type, specification, latitude, longitude, primary_image_url, location").order("published_at", { ascending: false }).limit(300),
    supabase.from("platform_settings").select("setting_value").eq("setting_key", "matching.weights").maybeSingle(),
  ]);
  const p = (prefs ?? {}) as BuyerPreferenceInput;
  if (!prefs || !hasMeaningfulPreferences(p)) {
    return (<><PageHeader eyebrow="Buying" title="Recommended for you" /><Card><EmptyState icon={<Sparkles />} title="Tell us what you're looking for"
      description="Set your budget, preferred makes and other preferences and we'll rank available vehicles by how well they match." action={<Button asChild><Link href="/dashboard/preferences">Set preferences</Link></Button>} /></Card></>);
  }
  const w = normaliseWeights((weights?.setting_value as object) ?? {});
  const ranked = (listings ?? []).map((l) => ({ l, m: scoreMatch(p, { ...l, latitude: l.latitude, longitude: l.longitude }, w) }))
    .filter((x) => x.m.score >= 0.5).sort((a, b) => b.m.score - a.m.score).slice(0, 12);
  return (
    <>
      <PageHeader eyebrow="Buying" title="Recommended for you" description="Live vehicles ranked against your stated preferences. We explain every match and any mismatches." actions={<Button asChild variant="secondary"><Link href="/dashboard/preferences">Edit preferences</Link></Button>} />
      {!ranked.length ? <Card><EmptyState icon={<Car />} title="No close matches right now" description="No available vehicles closely match your preferences yet. Try widening your budget or mileage, or save a search for alerts." /></Card> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {ranked.map(({ l, m }) => (
            <Link key={l.id} href={`/cars/${l.slug}`} className="flex gap-4 rounded-[var(--radius-md)] border border-line bg-white p-4 hover:shadow-[var(--shadow-soft)]">
              <div className="relative aspect-[4/3] w-32 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-mist">{l.primary_image_url ? <Image src={l.primary_image_url} alt="" fill sizes="128px" className="object-cover" /> : null}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2"><p className="font-semibold text-ink">{l.year} {l.make} {l.model}</p><Badge tone="accent">{formatPercent(m.score)} match</Badge></div>
                <p className="text-[13px] text-muted">{formatPrice(l.asking_price)} · {formatMileage(l.mileage)} · {l.location}</p>
                <ul className="mt-2 space-y-0.5 text-[12.5px] text-success">{m.reasons.slice(0, 3).map((r) => <li key={r}>✓ {r}</li>)}</ul>
                {m.mismatches.length ? <ul className="mt-1 space-y-0.5 text-[12.5px] text-warning">{m.mismatches.slice(0, 2).map((r) => <li key={r}>• {r}</li>)}</ul> : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
