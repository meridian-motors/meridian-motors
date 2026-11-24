import Link from "next/link";
import { ArrowRight, BadgeCheck, BarChart3, FileCheck2, Gauge, LineChart, MessageSquareText, Scale, ShieldCheck, Sparkles, Timer } from "lucide-react";
import { HeroArt } from "@/components/home/hero-art";
import { HeroSearch } from "@/components/home/hero-search";
import { VehicleGrid } from "@/components/marketplace/vehicle-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { getFacets, getFeaturedListings, getRecentListings, getSavedVehicleIds } from "@/lib/data/listings";
import { getSession } from "@/lib/auth";
import { POPULAR_MAKES } from "@/lib/constants";


const BODY_LINKS = [
  ["suv", "SUVs"], ["hatchback", "Hatchbacks"], ["estate", "Estates"], ["saloon", "Saloons"], ["coupe", "Coupés"], ["convertible", "Convertibles"],
];

export default async function HomePage() {
  const [session, facets, featured, recent] = await Promise.all([getSession(), getFacets(), getFeaturedListings(4), getRecentListings(8)]);
  const savedIds = session ? await getSavedVehicleIds() : new Set<string>();
  const makes = facets.makes.length ? facets.makes.map((m) => m.make) : POPULAR_MAKES;
  const recentOnly = recent.filter((r) => !featured.some((f) => f.id === r.id)).slice(0, 8);

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-ink text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_70%_20%,rgba(168,140,99,0.14),transparent_60%)]" />
        <div className="container-page relative grid min-h-[620px] items-center gap-10 py-16 lg:min-h-[680px] lg:grid-cols-[1.05fr_1fr] lg:py-20">
          <div className="relative z-10">
            <p className="eyebrow !text-accent">Premium Automotive Marketplace</p>
            <h1 className="mt-5 max-w-xl text-[40px] font-semibold leading-[1.05] !text-white sm:text-[56px] lg:text-[64px]">
              A smarter way to buy and sell cars.
            </h1>
            <p className="mt-6 max-w-lg text-[16px] leading-relaxed text-white/65">
              Discover quality vehicles from private sellers, or sell your own with intelligent Fast Sale pricing, a professionally prepared listing and a team that handles the details.
            </p>
            <div className="mt-9"><HeroSearch makes={makes} /></div>
          </div>
          <div className="relative hidden lg:block">
            <HeroArt className="w-[118%] max-w-none -translate-x-[4%]" />
          </div>
        </div>
        <div className="relative border-t border-white/10">
          <div className="container-page grid grid-cols-2 gap-6 py-6 text-[12.5px] text-white/60 md:grid-cols-4">
            <span className="flex items-center gap-2"><ShieldCheck className="size-4 text-accent" />Every listing reviewed before publication</span>
            <span className="flex items-center gap-2"><BadgeCheck className="size-4 text-accent" />Checks shown with provider &amp; date</span>
            <span className="flex items-center gap-2"><Scale className="size-4 text-accent" />Transparent, evidence-based pricing</span>
            <span className="flex items-center gap-2"><Timer className="size-4 text-accent" />Fast Sale positioning for sellers</span>
          </div>
        </div>
      </section>

      {/* FEATURED + RECENT */}
      <section className="container-page py-20">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">The marketplace</p>
            <h2 className="mt-2 text-3xl font-semibold">{featured.length ? "Featured vehicles" : "Recently listed"}</h2>
          </div>
          <Button asChild variant="secondary"><Link href="/cars">View all {facets.total ? facets.total.toLocaleString("en-GB") : ""} vehicles <ArrowRight /></Link></Button>
        </div>
        {featured.length || recentOnly.length ? (
          <VehicleGrid listings={featured.length ? featured : recentOnly} savedIds={savedIds} signedIn={!!session} />
        ) : (
          <div className="rounded-[var(--radius-md)] border border-dashed border-line bg-white">
            <EmptyState icon={<Gauge />} title="New vehicles are being prepared"
              description="Every vehicle on Meridian Motors is reviewed before it is published. Check back soon, or be among the first sellers on the platform."
              action={<Button asChild><Link href="/sell">Sell your car</Link></Button>} />
          </div>
        )}
        {featured.length && recentOnly.length ? (
          <div className="mt-16">
            <h2 className="mb-8 text-2xl font-semibold">Recently listed</h2>
            <VehicleGrid listings={recentOnly.slice(0, 4)} savedIds={savedIds} signedIn={!!session} />
          </div>
        ) : null}
        <div className="mt-12 flex flex-wrap gap-2">
          {BODY_LINKS.map(([b, label]) => (
            <Link key={b} href={`/cars?body=${b}`} className="rounded-full border border-line bg-white px-4 py-2 text-[13px] text-slate transition-colors hover:border-ink hover:text-ink">{label}</Link>
          ))}
          <Link href="/cars?fuel=electric,hybrid,plug_in_hybrid" className="rounded-full border border-line bg-white px-4 py-2 text-[13px] text-slate transition-colors hover:border-ink hover:text-ink">Electric &amp; hybrid</Link>
        </div>
      </section>

      {/* SELL */}
      <section className="border-y border-line bg-white">
        <div className="container-page grid gap-14 py-20 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="eyebrow">Sell with Meridian</p>
            <h2 className="mt-3 text-[34px] font-semibold leading-tight">Sell your car privately, without doing it alone.</h2>
            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-slate">
              Submit your vehicle in minutes. We prepare an indicative valuation from real market evidence, recommend a competitive asking price, create and optimise your listing, and help you manage enquiries and viewings. You stay the owner and approve every price.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg"><Link href="/dashboard/vehicles/new">Start your submission <ArrowRight /></Link></Button>
              <Button asChild size="lg" variant="secondary"><Link href="/sell">How selling works</Link></Button>
            </div>
            <p className="mt-5 text-[12.5px] text-muted">No upfront listing fee. A success fee applies only when your car sells through Meridian.</p>
          </div>
          <ol className="grid gap-px overflow-hidden rounded-[var(--radius-md)] border border-line bg-line sm:grid-cols-2">
            {[
              [FileCheck2, "Submit", "Registration, specification, condition, history and photographs — saved as you go."],
              [LineChart, "Value", "An indicative market range, suggested asking price and fast-sale price, with the evidence."],
              [Sparkles, "List", "A professional listing prepared from your confirmed details, approved by you before it goes live."],
              [MessageSquareText, "Sell", "Qualified enquiries, viewing coordination and help through to handover."],
            ].map(([Icon, title, text], i) => {
              const I = Icon as typeof FileCheck2;
              return (
                <li key={String(title)} className="bg-white p-6">
                  <div className="flex items-center justify-between">
                    <I className="size-5 text-accent" strokeWidth={1.5} />
                    <span className="text-[11px] font-semibold tracking-[0.16em] text-silver">0{i + 1}</span>
                  </div>
                  <h3 className="mt-5 text-[16px] font-semibold">{String(title)}</h3>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{String(text)}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* FAST SALE */}
      <section className="bg-charcoal text-white">
        <div className="container-page grid gap-14 py-20 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <p className="eyebrow !text-accent">Fast Sale pricing</p>
            <h2 className="mt-3 text-[34px] font-semibold leading-tight !text-white">Priced to attract serious buyers.</h2>
            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-white/65">
              Our pricing engine compares your vehicle with real comparable vehicles, adjusting for age, mileage, condition and history. You see the market range, a suggested asking price and a competitive fast-sale price — and exactly how we reached them.
            </p>
            <ul className="mt-8 space-y-3 text-[14px] text-white/80">
              {["You always choose and approve your asking price", "Prices are never reduced without your permission", "Never below the minimum you authorise", "If there isn't enough evidence, we tell you — we never guess"].map((t) => (
                <li key={t} className="flex items-start gap-3"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-accent" />{t}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-[var(--radius-md)] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <p className="text-[12px] uppercase tracking-[0.16em] text-white/40">How a valuation is presented</p>
            <div className="mt-6 space-y-5">
              {[["Market range", "The typical advertised range for comparable vehicles", "w-[78%]"], ["Suggested asking price", "In line with similar vehicles on the market", "w-[58%]"], ["Fast-sale price", "Among the most competitive comparable vehicles", "w-[40%]"]].map(([label, desc, w]) => (
                <div key={label}>
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="text-[14px] font-medium">{label}</p>
                    <p className="text-[12px] text-white/45">{desc}</p>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-white/10"><div className={`h-full rounded-full ${label === "Fast-sale price" ? "bg-accent" : "bg-silver/70"} ${w}`} /></div>
                </div>
              ))}
            </div>
            <p className="mt-8 border-t border-white/10 pt-5 text-[12px] leading-relaxed text-white/45">
              Illustration only. Real valuations show figures, a confidence level and the comparable evidence used. Valuations are indicative and are not a guaranteed sale price or timescale.
            </p>
          </div>
        </div>
      </section>

      {/* AI DISCOVERY + TRUST */}
      <section className="container-page grid gap-6 py-20 md:grid-cols-3">
        {[
          [Sparkles, "Describe the car you want", "Search the way you speak — “an automatic estate under £15k with low mileage”. We translate it into filters and show only real, available vehicles."],
          [ShieldCheck, "Verification you can read", "When a check has been completed we show what was checked, by whom, when, and its limitations. We never label a vehicle verified unless it has been."],
          [BarChart3, "Clear seller disclosures", "Damage, mechanical issues, accident history, finance and modifications are disclosed by the seller and shown on every listing."],
        ].map(([Icon, title, text]) => {
          const I = Icon as typeof Sparkles;
          return (
            <div key={String(title)} className="rounded-[var(--radius-md)] border border-line bg-white p-7">
              <I className="size-5 text-accent" strokeWidth={1.5} />
              <h3 className="mt-5 text-[17px] font-semibold">{String(title)}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">{String(text)}</p>
            </div>
          );
        })}
      </section>

      {/* CTA */}
      <section className="container-page pb-20">
        <div className="relative overflow-hidden rounded-[var(--radius-lg)] bg-ink px-6 py-14 text-center sm:px-12">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_120%,rgba(168,140,99,0.25),transparent_70%)]" />
          <h2 className="relative text-3xl font-semibold !text-white sm:text-4xl">Ready when you are.</h2>
          <p className="relative mx-auto mt-4 max-w-xl text-[15px] text-white/60">Find your next car, or find out what yours is worth on today&apos;s market.</p>
          <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" variant="inverse"><Link href="/cars">Browse vehicles</Link></Button>
            <Button asChild size="lg" variant="outline-inverse"><Link href="/sell">Get a valuation</Link></Button>
          </div>
        </div>
      </section>
    </>
  );
}
