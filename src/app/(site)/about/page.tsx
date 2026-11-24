import type { Metadata } from "next";
import { ContentHero } from "@/components/site/content";

export const metadata: Metadata = { title: "About", description: "Meridian Motors is an intelligent automotive marketplace and private vehicle sales brokerage for the UK.", alternates: { canonical: "/about" } };

export default function AboutPage() {
  return (
    <>
      <ContentHero eyebrow="About Meridian Motors" title="Intelligent vehicle buying and selling." intro="We are building a better way for private owners to sell their cars, and for buyers to find the right one — with technology that makes pricing transparent and the process calmer." />
      <div className="container-page grid gap-12 py-16 lg:grid-cols-3">
        {[
          ["Evidence over guesswork", "Pricing should be explainable. Our Fast Sale engine shows its working: the comparable vehicles, the adjustments and the confidence. If the evidence isn't there, we say so."],
          ["Honest listings", "Clear seller disclosures, specific verification details and no inflated claims. We never describe a vehicle as verified unless the relevant check has been completed."],
          ["Sellers stay in control", "Private sellers remain the owners of their vehicles. They set their price, approve their listing and authorise any change. We never reduce a price without permission."],
        ].map(([t, d]) => (
          <div key={t}>
            <div className="h-px w-10 bg-accent" />
            <h2 className="mt-5 text-xl font-semibold">{t}</h2>
            <p className="mt-3 text-[14.5px] leading-relaxed text-slate">{d}</p>
          </div>
        ))}
      </div>
      <div className="container-page pb-20">
        <div className="prose-meridian max-w-3xl">
          <h2>What Meridian Motors is — and is not</h2>
          <p>Meridian Motors operates an online marketplace and a private vehicle sales brokerage service in the United Kingdom. We help private sellers present, price and sell their vehicles, and we help buyers discover and enquire about them.</p>
          <p>We do not buy, own or take possession of the vehicles listed, unless a separate agreement says otherwise, and we do not hold buyers&apos; purchase funds. The contract of sale for a vehicle is between the buyer and the seller. Our responsibilities as a marketplace and broker are set out in our <a href="/terms">terms</a>.</p>
          <h2>Built to grow responsibly</h2>
          <p>We are launching with private sellers and buyers. Over time the same platform will support dealerships and automotive groups with inventory tools, pricing intelligence and lead management — always with the same commitment to transparency.</p>
        </div>
      </div>
    </>
  );
}
