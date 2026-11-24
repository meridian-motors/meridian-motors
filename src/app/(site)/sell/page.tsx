import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Camera, CheckCircle2, ClipboardList, FileText, Handshake, LineChart, MessagesSquare, ShieldCheck } from "lucide-react";
import { ContentHero } from "@/components/site/content";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getPublicFeeTiers } from "@/lib/data/listings";
import { DEFAULT_FEE_TIERS } from "@/lib/pricing/fees";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = {
  title: "Sell your car",
  description: "Sell your car privately with Meridian Motors: an indicative valuation from real market evidence, Fast Sale pricing, a professional listing and help through to handover. Pay only when you sell.",
  alternates: { canonical: "/sell" },
};

export default async function SellPage() {
  const tiers = (await getPublicFeeTiers()) ?? DEFAULT_FEE_TIERS;
  let services: { code: string; name: string; description: string; price: number }[] = [];
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("service_catalog").select("code, name, description, price").eq("is_active", true).order("display_order");
    services = data ?? [];
  }
  return (
    <>
      <ContentHero eyebrow="Sell your car" title="Sell privately. Priced intelligently. Supported throughout."
        intro="Meridian Motors helps private owners sell their cars quickly and confidently. You remain the owner and the seller — we provide the pricing intelligence, the listing, the buyers and the support." />
      <section className="container-page py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            [ClipboardList, "1. Submit your vehicle", "A guided eight-step submission covering registration, specification, condition, history and photographs. Progress saves automatically."],
            [ShieldCheck, "2. We review it", "Our team reviews your details and disclosures. Where a registration lookup is available we compare your details with DVLA records."],
            [LineChart, "3. Receive your valuation", "An indicative market range, a suggested asking price and a fast-sale price — with the comparable evidence and our reasoning."],
            [FileText, "4. Approve your listing", "We prepare a professional listing from your confirmed details. Nothing is published until you approve the content and the price."],
            [MessagesSquare, "5. Receive enquiries", "Buyers enquire through Meridian. We filter enquiries, answer what we can and help arrange viewings."],
            [Handshake, "6. Complete the sale", "Agree a price, confirm handover and mark the sale complete. Our success fee becomes payable only at this point."],
          ].map(([Icon, title, text]) => {
            const I = Icon as typeof ClipboardList;
            return (
              <div key={String(title)} className="rounded-[var(--radius-md)] border border-line bg-white p-6">
                <I className="size-5 text-accent" strokeWidth={1.5} />
                <h2 className="mt-4 text-[16px] font-semibold">{String(title)}</h2>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{String(text)}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild size="lg"><Link href="/dashboard/vehicles/new">Start your submission <ArrowRight /></Link></Button>
          <Button asChild size="lg" variant="secondary"><Link href="/how-it-works">Read the full process</Link></Button>
        </div>
      </section>

      <section id="valuation" className="border-y border-line bg-white">
        <div className="container-page grid gap-12 py-16 lg:grid-cols-2">
          <div>
            <p className="eyebrow">Fast Sale pricing</p>
            <h2 className="mt-3 text-3xl font-semibold">How we price your car</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-slate">Our pricing engine compares your vehicle with real comparable vehicles — completed Meridian sales, Meridian listings and licensed market data where available. Each comparable is adjusted for age, mileage and condition, with recent evidence and completed sales weighted most heavily.</p>
            <p className="mt-4 text-[15px] leading-relaxed text-slate">If there is not enough evidence for a reliable valuation, we say so rather than guess. A specialist can then review your vehicle, or you can set your own price.</p>
          </div>
          <ul className="space-y-4">
            {[
              ["Estimated market range", "Where comparable vehicles are typically advertised."],
              ["Suggested asking price", "In line with the market for a vehicle like yours."],
              ["Fast-sale price", "Among the most competitive comparable vehicles, to attract serious buyers sooner. It is a trade-off: a quicker sale for a lower price."],
              ["Confidence and evidence", "How reliable the valuation is, the comparables used and any data limitations."],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3 rounded-[var(--radius-sm)] border border-line p-4">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" />
                <div><p className="text-[14.5px] font-medium text-ink">{t}</p><p className="mt-0.5 text-[13.5px] text-muted">{d}</p></div>
              </li>
            ))}
            <li className="text-[12.5px] leading-relaxed text-muted">You always approve your asking price and set a minimum. We never reduce your price without your permission and never below your minimum. Valuations are indicative — not a guaranteed sale price or timescale.</li>
          </ul>
        </div>
      </section>

      <section id="fees" className="container-page py-16">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="eyebrow">Fees</p>
            <h2 className="mt-3 text-3xl font-semibold">Pay only when you sell</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-slate">There is no fee to submit your vehicle, receive a valuation or list on the marketplace. A success fee becomes payable only when your sale is completed — that is, when you and Meridian have both confirmed the handover.</p>
            <p className="mt-4 text-[13px] text-muted">Meridian Motors never holds the buyer&apos;s payment for your car. The buyer pays you directly; our fee is invoiced to you separately.</p>
          </div>
          <div className="overflow-hidden rounded-[var(--radius-md)] border border-line bg-white">
            <Table>
              <THead><tr><TH>Final sale price</TH><TH className="text-right">Meridian success fee</TH></tr></THead>
              <TBody>
                {tiers.map((t) => (
                  <TR key={t.min}><TD>{formatPrice(t.min)}{t.max ? ` – ${formatPrice(t.max)}` : " and above"}</TD><TD className="text-right font-semibold text-ink">{formatPrice(t.fee)}</TD></TR>
                ))}
              </TBody>
            </Table>
            <p className="border-t border-line px-4 py-3 text-[12px] text-muted">Vehicles selling below {formatPrice(tiers[0]?.min ?? 2000)} incur no success fee. Fees are reviewed periodically and the fee applicable is the one shown when your listing is approved. [Pricing subject to final commercial review.]</p>
          </div>
        </div>
        {services.length ? (
          <div className="mt-16">
            <h3 className="text-xl font-semibold">Optional assisted-selling services</h3>
            <p className="mt-1.5 text-[14px] text-muted">Add extra help whenever you need it, from your seller dashboard.</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((s) => (
                <div key={s.code} className="rounded-[var(--radius-md)] border border-line bg-white p-5">
                  <div className="flex items-start justify-between gap-3"><p className="font-medium text-ink">{s.name}</p><p className="text-[14px] font-semibold">{formatPrice(s.price)}</p></div>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{s.description}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="container-page pb-20">
        <div className="flex flex-col items-start justify-between gap-6 rounded-[var(--radius-lg)] bg-ink p-8 sm:flex-row sm:items-center sm:p-12">
          <div>
            <p className="flex items-center gap-2 text-[13px] text-white/60"><Camera className="size-4 text-accent" /> Have your V5C, service records and a few photos ready</p>
            <h2 className="mt-3 text-2xl font-semibold !text-white">Start your submission in a few minutes.</h2>
          </div>
          <Button asChild size="lg" variant="inverse"><Link href="/dashboard/vehicles/new">Sell your car <ArrowRight /></Link></Button>
        </div>
      </section>
    </>
  );
}
