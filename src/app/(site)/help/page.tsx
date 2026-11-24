import type { Metadata } from "next";
import Link from "next/link";
import { ContentHero } from "@/components/site/content";

export const metadata: Metadata = { title: "Help centre", description: "Answers to common questions about buying and selling on Meridian Motors.", alternates: { canonical: "/help" } };

const FAQ: { section: string; items: [string, string][] }[] = [
  { section: "Buying", items: [
    ["Who am I buying from?", "Most vehicles on Meridian Motors are sold by private individuals, and each listing clearly says whether the seller is private or a trader. Meridian arranges the sale but the contract is between you and the seller."],
    ["Do I pay Meridian for the car?", "No. You pay the seller directly once you are satisfied with the vehicle and its documents. Meridian Motors never asks buyers to transfer purchase money to us. If anyone asks you to, contact us immediately."],
    ["What does 'verified' mean?", "We only show a check or verification when it has actually been completed, together with what was checked, by whom, when and its limitations. A DVLA record check confirms the vehicle details held by the DVLA; it does not confirm ownership, outstanding finance or full history."],
    ["What rights do I have buying privately?", "Buying from a private seller gives fewer statutory rights than buying from a trader: the vehicle must be as described and the seller must have the right to sell it. We strongly recommend an independent inspection and a vehicle history check. [LEGAL REVIEW]"],
    ["How does the AI search work?", "You describe the car you want; we translate your description into marketplace filters. Results only ever include real, published vehicles — the AI never invents listings."],
  ] },
  { section: "Selling", items: [
    ["How much does it cost?", "Submitting, valuing and listing your vehicle is free. A success fee is payable only when your sale completes. See the fee table on the Sell page."],
    ["Is the valuation a guarantee?", "No. Valuations are indicative estimates based on comparable market evidence. They are not a guaranteed sale price, and we never guarantee a sale within a particular time."],
    ["Can Meridian change my price?", "Never without your permission. We may suggest a price review based on listing performance, but you decide. Your price can never be set below the minimum you authorise."],
    ["What information is shown publicly?", "Your listing shows the vehicle details, photographs, disclosures and your town/postcode district. Your registration number, VIN, name, contact details, address, minimum price and documents are never shown publicly."],
    ["How do I mark my car as sold?", "From your dashboard, open the vehicle and choose 'Report a sale'. Meridian confirms the handover with you before the sale is marked complete."],
  ] },
  { section: "Account & privacy", items: [
    ["Can I buy and sell with one account?", "Yes. Every account can save vehicles, make enquiries and submit vehicles for sale."],
    ["How do I delete my account?", "Go to Dashboard → Settings → Request account deletion. Some records (for example completed transactions and payment records) must be retained for legal and accounting reasons; we explain what is kept."],
    ["How do I stop marketing emails?", "Use the link at the bottom of any email, or change your notification preferences in Settings."],
  ] },
];

export default function HelpPage() {
  return (
    <>
      <ContentHero eyebrow="Help centre" title="Answers to common questions" />
      <div className="container-page grid gap-14 py-14 lg:grid-cols-[220px_1fr]">
        <nav className="hidden lg:block" aria-label="Help sections"><ul className="sticky top-24 space-y-2 text-[14px]">{FAQ.map((s) => <li key={s.section}><a href={`#${s.section.toLowerCase().replace(/\W+/g, "-")}`} className="text-slate hover:text-ink">{s.section}</a></li>)}</ul></nav>
        <div className="max-w-3xl space-y-14">
          {FAQ.map((s) => (
            <section key={s.section} id={s.section.toLowerCase().replace(/\W+/g, "-")}>
              <h2 className="text-2xl font-semibold">{s.section}</h2>
              <div className="mt-5 divide-y divide-line border-y border-line">
                {s.items.map(([q, a]) => (
                  <details key={q} className="group py-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium text-ink">{q}<span className="text-muted transition-transform group-open:rotate-45">+</span></summary>
                    <p className="mt-3 text-[14.5px] leading-relaxed text-slate">{a}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
          <p className="text-[14px] text-slate">Still need help? <Link href="/contact" className="underline">Contact us</Link>.</p>
        </div>
      </div>
    </>
  );
}
