import Link from "next/link";
import { Logo } from "./logo";

const COLS = [
  { title: "Buy", links: [["/cars", "Browse cars"], ["/cars?sort=newest", "Recently listed"], ["/cars?fuel=electric,hybrid,plug_in_hybrid", "Electric & hybrid"], ["/dashboard/saved", "Saved vehicles"]] },
  { title: "Sell", links: [["/sell", "Sell your car"], ["/sell#valuation", "Fast Sale pricing"], ["/sell#fees", "Fees"], ["/dashboard/vehicles/new", "Start a submission"]] },
  { title: "Company", links: [["/about", "About Meridian"], ["/how-it-works", "How it works"], ["/help", "Help centre"], ["/contact", "Contact"]] },
  { title: "Legal", links: [["/terms", "Terms & conditions"], ["/privacy", "Privacy policy"], ["/cookies", "Cookie policy"], ["/contact?topic=complaint", "Complaints"]] },
];

export function SiteFooter() {
  return (
    <footer className="bg-ink text-white">
      <div className="container-page grid gap-12 py-16 lg:grid-cols-[1.3fr_2fr]">
        <div className="max-w-sm">
          <Logo inverse />
          <p className="mt-6 text-[13.5px] leading-relaxed text-white/60">
            A smarter way to buy and sell cars. Meridian Motors is an intelligent automotive marketplace and private vehicle sales brokerage serving the United Kingdom.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {COLS.map((c) => (
            <div key={c.title}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">{c.title}</p>
              <ul className="mt-4 space-y-2.5">
                {c.links.map(([href, label]) => (
                  <li key={href}><Link href={href} className="text-[13.5px] text-white/75 transition-colors hover:text-white">{label}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-page flex flex-col gap-3 py-6 text-[12px] leading-relaxed text-white/45 md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} Meridian Motors. All rights reserved.</p>
          <p className="max-w-2xl md:text-right">
            Vehicles are sold by their owners. Meridian Motors does not take ownership of vehicles or hold buyers&apos; purchase funds. Valuations are indicative and are not guaranteed sale prices.
          </p>
        </div>
      </div>
    </footer>
  );
}
