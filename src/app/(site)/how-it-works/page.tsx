import type { Metadata } from "next";
import Link from "next/link";
import { ContentHero } from "@/components/site/content";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "How it works", description: "How buying and selling on Meridian Motors works, from submission and valuation to enquiries, viewings and handover.", alternates: { canonical: "/how-it-works" } };

const SELL = [
  ["Submission", "Tell us about your vehicle in an eight-step guided form. Your progress saves automatically and you can return at any time."],
  ["Review & verification", "Meridian staff review your details, photographs and disclosures. Where available we compare your registration details with DVLA records. We may ask you for more information."],
  ["Valuation", "Our pricing engine produces an indicative market range, suggested asking price and fast-sale price from real comparable evidence — or tells you when there isn't enough evidence."],
  ["Your approval", "You choose your asking price and the minimum you would accept, and approve the listing wording. Nothing is published without your approval."],
  ["Publication", "Meridian approves the listing and publishes it on the marketplace. Your registration, VIN, address, contact details and minimum price are never shown publicly."],
  ["Enquiries & viewings", "Buyers enquire through Meridian. We triage enquiries, help answer questions and coordinate viewings."],
  ["Sale & handover", "When you agree a sale, tell us through your dashboard. Once the handover is confirmed by you and by Meridian, the sale is complete and our success fee becomes payable."],
];
const BUY = [
  ["Search your way", "Use filters, or simply describe what you want. Our AI search turns your description into filters and shows only real, available vehicles."],
  ["Read the full picture", "Every listing shows the specification, seller disclosures, and any completed checks with their provider, date and limitations."],
  ["Enquire with confidence", "Ask a question, request a viewing or make an offer. Your contact details are shared with Meridian, not published."],
  ["Buy from the owner", "You buy directly from the seller and pay them directly. Meridian does not hold your purchase funds. Always inspect the vehicle and its documents before paying."],
];

export default function HowItWorksPage() {
  return (
    <>
      <ContentHero eyebrow="How it works" title="A clear process for buyers and sellers" intro="Meridian Motors combines a curated marketplace with a private-sale brokerage service. Here is exactly what happens at each stage." />
      <div className="container-page grid gap-16 py-16 lg:grid-cols-2">
        {[["Selling with Meridian", SELL], ["Buying on Meridian", BUY]].map(([title, steps]) => (
          <section key={title as string}>
            <h2 className="text-2xl font-semibold">{title as string}</h2>
            <ol className="mt-8 space-y-0 border-l border-line">
              {(steps as string[][]).map(([t, d], i) => (
                <li key={t} className="relative pb-8 pl-8 last:pb-0">
                  <span className="absolute -left-[13px] top-0 flex size-6 items-center justify-center rounded-full border border-line bg-white text-[11px] font-semibold text-ink">{i + 1}</span>
                  <h3 className="text-[16px] font-semibold">{t}</h3>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-slate">{d}</p>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
      <div className="container-page flex flex-wrap gap-3 pb-20"><Button asChild size="lg"><Link href="/cars">Browse vehicles</Link></Button><Button asChild size="lg" variant="secondary"><Link href="/sell">Sell your car</Link></Button></div>
    </>
  );
}
