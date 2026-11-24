"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, Loader2, Search, Sparkles } from "lucide-react";
import { naturalLanguageSearch } from "@/app/actions/public";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "Automatic petrol under £12,000 with less than 60,000 miles",
  "Family SUV, diesel, 2019 or newer",
  "Electric hatchback under £20k",
];

export function HeroSearch({ makes }: { makes: string[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<"ai" | "filters">("ai");
  const [query, setQuery] = useState("");
  const [make, setMake] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  const submitAi = (q: string) => start(async () => {
    setNote(null);
    const res = await naturalLanguageSearch(q);
    if (!res.ok) { setNote(res.message ?? "Please describe the car you want."); return; }
    router.push(res.href);
  });

  return (
    <div className="w-full max-w-3xl">
      <div className="mb-3 inline-flex rounded-[var(--radius-sm)] bg-white/10 p-1 backdrop-blur" role="tablist" aria-label="Search mode">
        {([["ai", "Describe it", Sparkles], ["filters", "Search by filter", Search]] as const).map(([m, label, Icon]) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
            className={cn("flex items-center gap-1.5 rounded-[3px] px-3.5 py-1.5 text-[12.5px] font-medium transition-colors", mode === m ? "bg-white text-ink" : "text-white/75 hover:text-white")}>
            <Icon className="size-3.5" />{label}
          </button>
        ))}
      </div>
      {mode === "ai" ? (
        <form onSubmit={(e) => { e.preventDefault(); submitAi(query); }} className="flex flex-col gap-2 rounded-[var(--radius-md)] bg-white p-2 shadow-[var(--shadow-lift)] sm:flex-row">
          <label htmlFor="hero-q" className="sr-only">Describe the car you are looking for</label>
          <input id="hero-q" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={500}
            placeholder="e.g. a comfortable automatic petrol car under £12,000"
            className="h-12 min-w-0 flex-1 px-3 text-[15px] text-ink placeholder:text-muted focus:outline-none" />
          <button type="submit" disabled={pending} className="flex h-12 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-ink px-6 text-sm font-medium text-white hover:bg-graphite disabled:opacity-60">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />} Find cars
          </button>
        </form>
      ) : (
        <form action="/cars" className="grid gap-2 rounded-[var(--radius-md)] bg-white p-2 shadow-[var(--shadow-lift)] sm:grid-cols-[1fr_1fr_auto]">
          <label className="sr-only" htmlFor="hero-make">Make</label>
          <select id="hero-make" name="make" value={make} onChange={(e) => setMake(e.target.value)} className="h-12 rounded-[var(--radius-sm)] border border-line px-3 text-[14px] text-ink focus:outline-none">
            <option value="">Any make</option>
            {makes.map((m) => <option key={m}>{m}</option>)}
          </select>
          <label className="sr-only" htmlFor="hero-price">Maximum price</label>
          <select id="hero-price" name="maxPrice" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="h-12 rounded-[var(--radius-sm)] border border-line px-3 text-[14px] text-ink focus:outline-none">
            <option value="">Any price</option>
            {[5000, 8000, 10000, 15000, 20000, 30000, 50000].map((p) => <option key={p} value={p}>Up to £{p.toLocaleString("en-GB")}</option>)}
          </select>
          <button className="flex h-12 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-ink px-6 text-sm font-medium text-white hover:bg-graphite"><Search className="size-4" /> Search</button>
        </form>
      )}
      {note ? <p className="mt-2 text-[13px] text-white/80">{note}</p> : null}
      {mode === "ai" ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <button key={e} onClick={() => { setQuery(e); submitAi(e); }} className="rounded-full border border-white/20 px-3 py-1 text-[12px] text-white/70 transition-colors hover:border-white/50 hover:text-white">
              {e}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
