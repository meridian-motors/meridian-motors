import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, BadgeCheck, Calendar, ChevronRight, Fuel, Gauge, Info, MapPin, Settings2, ShieldCheck, User } from "lucide-react";
import { getListingBySlug, getSavedVehicleIds, getSimilarListings } from "@/lib/data/listings";
import { getSession } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { BODY_LABELS, CONDITION_LABELS, FUEL_LABELS, SERVICE_HISTORY_LABELS, TRANSMISSION_LABELS } from "@/lib/constants";
import { formatDate, formatEngine, formatMileage, formatPrice } from "@/lib/format";
import { Gallery } from "@/components/marketplace/gallery";
import { EnquiryForm } from "@/components/marketplace/enquiry-form";
import { SaveButton } from "@/components/marketplace/save-button";
import { VehicleGrid } from "@/components/marketplace/vehicle-card";
import { ViewTracker } from "@/components/marketplace/view-tracker";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DefinitionList } from "@/components/ui/misc";

type Props = { params: Promise<{ slug: string }> };

const CHECK_LABELS: Record<string, string> = {
  dvla_vehicle_enquiry: "DVLA vehicle record", mot_history: "MOT history", outstanding_finance: "Outstanding finance", stolen: "Stolen vehicle register",
  write_off: "Insurance write-off", mileage: "Mileage records", full_history: "Vehicle history",
};
const VERIFICATION_LABELS: Record<string, string> = {
  identity: "Seller identity checked", registration_match: "Registration matched to documents", mileage_photo: "Mileage photo reviewed",
  v5c_document: "V5C logbook sighted", service_history: "Service records reviewed", photos: "Photographs reviewed", disclosures: "Disclosures reviewed",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const l = await getListingBySlug((await params).slug);
  if (!l) return { title: "Vehicle not available", robots: { index: false } };
  const title = `${l.year} ${l.make} ${l.model}${l.derivative ? ` ${l.derivative}` : ""} — ${formatPrice(l.asking_price)}`;
  const description = l.short_description ?? `${l.year} ${l.make} ${l.model}, ${formatMileage(l.mileage)}, ${FUEL_LABELS[l.fuel_type]}, ${TRANSMISSION_LABELS[l.transmission]}. ${l.location ? `Located in ${l.location}.` : ""}`;
  return {
    title, description,
    alternates: { canonical: `/cars/${l.slug}` },
    openGraph: { title, description, url: `/cars/${l.slug}`, images: l.primary_image_url ? [{ url: l.primary_image_url }] : undefined },
  };
}

export default async function VehiclePage({ params }: Props) {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);
  if (!listing) notFound();
  const [session, similar] = await Promise.all([getSession(), getSimilarListings(listing)]);
  const savedIds = session ? await getSavedVehicleIds() : new Set<string>();
  // RLS only returns the private vehicle row to its owner (or staff), so this is a safe ownership check.
  let isOwner = false;
  if (session?.sellerId) {
    const supabase = await createClient();
    const { data } = await supabase.from("vehicles").select("id").eq("id", listing.vehicle_id).eq("owner_id", session.sellerId).maybeSingle();
    isOwner = !!data;
  }
  const name = `${listing.year} ${listing.make} ${listing.model}`;

  const disclosures = [
    ["Cosmetic damage", listing.cosmetic_damage],
    ["Mechanical issues", listing.mechanical_issues],
    ["Accident history", listing.accident_history],
    ["Modifications", listing.modifications],
    ["Other information", listing.other_disclosures],
  ].filter(([, v]) => v) as [string, string][];

  // Structured data: only accurate public facts. No seller identity, no registration/VIN.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Car",
    name, brand: { "@type": "Brand", name: listing.make }, model: listing.model, vehicleModelDate: String(listing.year),
    mileageFromOdometer: { "@type": "QuantitativeValue", value: listing.mileage, unitCode: "SMI" },
    fuelType: FUEL_LABELS[listing.fuel_type], vehicleTransmission: TRANSMISSION_LABELS[listing.transmission],
    bodyType: listing.body_type ? BODY_LABELS[listing.body_type] : undefined, color: listing.colour ?? undefined,
    numberOfDoors: listing.doors ?? undefined, seatingCapacity: listing.seats ?? undefined, itemCondition: "https://schema.org/UsedCondition",
    image: listing.images.map((i) => i.url).slice(0, 6), url: `${publicEnv.siteUrl}/cars/${listing.slug}`,
    offers: { "@type": "Offer", price: listing.asking_price, priceCurrency: "GBP", availability: "https://schema.org/InStock" },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <ViewTracker listingId={listing.id} />
      <div className="container-page py-8 lg:py-10">
        <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-1.5 text-[12.5px] text-muted">
          <Link href="/cars" className="hover:text-ink">Cars</Link><ChevronRight className="size-3" />
          <Link href={`/cars?make=${encodeURIComponent(listing.make)}`} className="hover:text-ink">{listing.make}</Link><ChevronRight className="size-3" />
          <Link href={`/cars?make=${encodeURIComponent(listing.make)}&model=${encodeURIComponent(listing.model)}`} className="hover:text-ink">{listing.model}</Link>
        </nav>

        <div className="grid gap-10 lg:grid-cols-[1fr_400px]">
          <div className="min-w-0 space-y-10">
            <Gallery images={listing.images} alt={name} listingId={listing.id} />

            <div className="lg:hidden"><PriceHeader listing={listing} name={name} saved={savedIds.has(listing.vehicle_id)} signedIn={!!session} /></div>

            <section aria-labelledby="key-facts">
              <h2 id="key-facts" className="sr-only">Key facts</h2>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-md)] border border-line bg-line sm:grid-cols-4">
                {[[Calendar, "Year", listing.year], [Gauge, "Mileage", formatMileage(listing.mileage)], [Fuel, "Fuel", FUEL_LABELS[listing.fuel_type]], [Settings2, "Gearbox", TRANSMISSION_LABELS[listing.transmission]]].map(([Icon, label, value]) => {
                  const I = Icon as typeof Calendar;
                  return (
                    <div key={String(label)} className="bg-white p-4">
                      <I className="size-4 text-silver" />
                      <p className="mt-3 text-[11px] uppercase tracking-[0.14em] text-muted">{String(label)}</p>
                      <p className="mt-0.5 text-[15px] font-semibold text-ink">{String(value)}</p>
                    </div>
                  );
                })}
              </div>
            </section>

            {listing.description ? (
              <section aria-labelledby="desc">
                <h2 id="desc" className="text-xl font-semibold">About this vehicle</h2>
                {listing.highlights.length ? (
                  <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                    {listing.highlights.map((h) => <li key={h} className="flex items-start gap-2 text-[14px] text-charcoal"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-accent" />{h}</li>)}
                  </ul>
                ) : null}
                <div className="mt-5 whitespace-pre-line text-[15px] leading-[1.75] text-slate">{listing.description}</div>
              </section>
            ) : null}

            <section aria-labelledby="spec">
              <h2 id="spec" className="text-xl font-semibold">Specification</h2>
              <DefinitionList className="mt-4" items={[
                { label: "Make", value: listing.make }, { label: "Model", value: listing.model }, { label: "Derivative", value: listing.derivative },
                { label: "Year", value: listing.year }, { label: "Mileage", value: formatMileage(listing.mileage) },
                { label: "Fuel", value: FUEL_LABELS[listing.fuel_type] }, { label: "Transmission", value: TRANSMISSION_LABELS[listing.transmission] },
                { label: "Body type", value: listing.body_type ? BODY_LABELS[listing.body_type] : null }, { label: "Engine size", value: formatEngine(listing.engine_size) },
                { label: "Colour", value: listing.colour }, { label: "Doors", value: listing.doors }, { label: "Seats", value: listing.seats },
                { label: "Previous keepers", value: listing.previous_keepers != null ? `${listing.previous_keepers} (seller stated)` : null },
                { label: "Condition", value: listing.condition ? `${CONDITION_LABELS[listing.condition]} (seller declared)` : null },
              ]} />
              {listing.specification.length ? (
                <div className="mt-6">
                  <p className="text-[13px] font-medium text-charcoal">Equipment &amp; features (seller stated)</p>
                  <div className="mt-3 flex flex-wrap gap-2">{listing.specification.map((s) => <Badge key={s} tone="outline" className="py-1 text-[12.5px]">{s}</Badge>)}</div>
                </div>
              ) : null}
            </section>

            <section aria-labelledby="history">
              <h2 id="history" className="text-xl font-semibold">History &amp; MOT</h2>
              <DefinitionList className="mt-4" items={[
                { label: "Service history", value: SERVICE_HISTORY_LABELS[listing.service_history] + (listing.service_history !== "unknown" ? " (seller stated)" : "") },
                { label: "MOT expiry", value: listing.mot_expiry_verified ? `${formatDate(listing.mot_expiry_verified)} (verified via ${listing.mot_source === "dvla" ? "DVLA" : "MOT history"})` : "Not verified — ask the seller" },
              ]} />
              {listing.service_history_notes ? <p className="mt-4 text-[14px] leading-relaxed text-slate">{listing.service_history_notes}</p> : null}
            </section>

            <section aria-labelledby="disclosures">
              <h2 id="disclosures" className="text-xl font-semibold">Seller disclosures</h2>
              <p className="mt-1.5 text-[13px] text-muted">Provided and confirmed by the seller. Meridian reviews disclosures but does not physically inspect vehicles unless stated.</p>
              <div className="mt-4 space-y-3">
                <div className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-line bg-white p-4 text-[14px]">
                  {listing.has_outstanding_finance ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /> : <Info className="mt-0.5 size-4 shrink-0 text-muted" />}
                  <div><p className="font-medium text-ink">Outstanding finance</p>
                    <p className="mt-0.5 text-slate">{listing.has_outstanding_finance == null ? "Not stated" : listing.has_outstanding_finance ? "The seller has declared outstanding finance, which must be settled before or at the point of sale." : "The seller has declared there is no outstanding finance."}</p></div>
                </div>
                {disclosures.length ? disclosures.map(([label, text]) => (
                  <div key={label} className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-line bg-white p-4 text-[14px]">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                    <div><p className="font-medium text-ink">{label}</p><p className="mt-0.5 whitespace-pre-line text-slate">{text}</p></div>
                  </div>
                )) : <p className="text-[14px] text-slate">The seller has not declared any damage, mechanical issues, accident history or modifications.</p>}
              </div>
            </section>

            <section aria-labelledby="verification">
              <h2 id="verification" className="text-xl font-semibold">Checks &amp; verification</h2>
              {listing.checks.length || listing.verifications.length ? (
                <div className="mt-4 overflow-hidden rounded-[var(--radius-md)] border border-line bg-white">
                  {listing.checks.map((c, idx) => (
                    <div key={`c-${idx}`} className="flex flex-col gap-1 border-b border-line p-4 last:border-0 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="flex items-center gap-2 text-[14px] font-medium text-ink"><ShieldCheck className="size-4 text-success" />{CHECK_LABELS[c.check_type] ?? c.check_type}</p>
                        {c.summary ? <p className="mt-1 text-[13px] text-slate">{c.summary}</p> : null}
                        {c.limitations ? <p className="mt-1 text-[12px] text-muted">Limitations: {c.limitations}</p> : null}
                      </div>
                      <div className="shrink-0 text-[12px] text-muted sm:text-right">
                        <Badge tone={c.result === "pass" ? "success" : c.result === "fail" ? "danger" : "warning"}>{c.result.replace("_", " ")}</Badge>
                        <p className="mt-1">{c.provider} · {formatDate(c.checked_at)}</p>
                      </div>
                    </div>
                  ))}
                  {listing.verifications.map((v, idx) => (
                    <div key={`v-${idx}`} className="flex flex-col gap-1 border-b border-line p-4 last:border-0 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="flex items-center gap-2 text-[14px] font-medium text-ink"><BadgeCheck className="size-4 text-accent" />{VERIFICATION_LABELS[v.verification_type] ?? v.verification_type}</p>
                        {v.summary ? <p className="mt-1 text-[13px] text-slate">{v.summary}</p> : null}
                      </div>
                      <p className="shrink-0 text-[12px] text-muted">Meridian Motors · {formatDate(v.verified_at)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-[14px] text-slate">No third-party checks have been recorded for this vehicle yet. We recommend that buyers carry out their own history check before purchase.</p>
              )}
              <p className="mt-3 text-[12px] leading-relaxed text-muted">A DVLA record check confirms vehicle details held by the DVLA; it does not confirm ownership, finance status or full history.</p>
            </section>
          </div>

          <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
            <div className="hidden lg:block"><PriceHeader listing={listing} name={name} saved={savedIds.has(listing.vehicle_id)} signedIn={!!session} /></div>
            <Card className="p-5" id="enquire">
              <h2 className="text-[16px] font-semibold">Enquire about this vehicle</h2>
              <p className="mb-5 mt-1 text-[13px] text-muted">Ask a question, request a viewing or make an offer.</p>
              <EnquiryForm listingId={listing.id} vehicleName={name} isOwner={isOwner}
                defaults={session ? { fullName: [session.profile.first_name, session.profile.last_name].filter(Boolean).join(" "), email: session.email, phone: session.profile.phone } : null} />
            </Card>
            <Card className="p-5 text-[13px] leading-relaxed text-slate">
              <p className="flex items-center gap-2 font-medium text-ink"><User className="size-4 text-silver" />{listing.seller_type === "trade" ? "Trade seller" : "Private seller"}</p>
              <p className="mt-2">{listing.seller_type === "trade"
                ? "This vehicle is sold by a business. Consumer rights for purchases from traders apply."
                : "This vehicle is sold by its owner, a private individual. Meridian Motors helps arrange the sale but does not own the vehicle or hold your purchase funds. Buyer protections differ from buying from a dealer — see our help centre."}</p>
            </Card>
          </aside>
        </div>

        {similar.length ? (
          <section className="mt-20" aria-labelledby="similar">
            <h2 id="similar" className="mb-6 text-2xl font-semibold">Similar vehicles</h2>
            <VehicleGrid listings={similar} savedIds={savedIds} signedIn={!!session} />
          </section>
        ) : null}
      </div>
    </>
  );
}

function PriceHeader({ listing, name, saved, signedIn }: { listing: Awaited<ReturnType<typeof getListingBySlug>> & object; name: string; saved: boolean; signedIn: boolean }) {
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        <Badge tone="outline">{listing.seller_type === "trade" ? "Trade seller" : "Private seller"}</Badge>
        {listing.verifications.length ? <Badge tone="accent"><BadgeCheck />Meridian reviewed</Badge> : null}
      </div>
      <h1 className="mt-3 text-[28px] font-semibold leading-tight">{name}</h1>
      {listing.derivative ? <p className="mt-1 text-[14px] text-muted">{listing.derivative}</p> : null}
      <p className="mt-4 font-[family-name:var(--font-display)] text-[34px] font-semibold tracking-[-0.03em] text-ink">{formatPrice(listing.asking_price)}</p>
      <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted"><MapPin className="size-3.5" />{[listing.location, listing.postcode_district].filter(Boolean).join(", ") || "United Kingdom"}</p>
      <div className="mt-5 flex gap-2">
        <a href="#enquire" className="inline-flex h-10 flex-1 items-center justify-center rounded-[var(--radius-sm)] bg-ink px-4 text-sm font-medium text-white hover:bg-graphite">Enquire</a>
        <SaveButton vehicleId={listing.vehicle_id} initialSaved={saved} signedIn={signedIn} />
      </div>
    </div>
  );
}
