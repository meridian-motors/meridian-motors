"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Search, Sparkles } from "lucide-react";
import { naturalLanguageSearch } from "@/app/actions/public";
import { filtersToQuery } from "@/lib/search/filters";
import type { MarketplaceFilters } from "@/lib/types";

export function MarketplaceSearchBar({ filters }: { filters: MarketplaceFilters }) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q ?? "");
  const [suggestions, setSuggestions] = useState<{ label: string; make: string; model: string; listing_count: number }[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pending, start] = useTransition();
  const [interpretation, setInterpretation] = useState<string[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    const term = q.trim();
    if (term.length < 2 || term.split(" ").length > 3) { setSuggestions([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggestions?q=${encodeURIComponent(term)}`);
        if (res.ok) setSuggestions(await res.json());
      } catch { /* suggestions are optional */ }
    }, 180);
    return () => clearTimeout(timer.current);
  }, [q]);

  const isNatural = (s: string) => s.trim().split(/\s+/).length >= 4 || /£|\bunder\b|\bmiles\b|\bbelow\b|\bless than\b/i.test(s);

  const submit = (term: string) => {
    setOpen(false);
    if (isNatural(term)) {
      start(async () => {
        const res = await naturalLanguageSearch(term);
        setInterpretation(res.interpretation.length ? res.interpretation : null);
        router.push(res.href);
      });
    } else {
      setInterpretation(null);
      router.push(`/cars?${filtersToQuery({ ...filters, q: term || undefined, page: undefined, sort: term ? "relevance" : filters.sort })}`);
    }
  };

  return (
    <div className="relative">
      <form role="search" onSubmit={(e) => { e.preventDefault(); if (active >= 0 && suggestions[active]) { const s = suggestions[active]; router.push(`/cars?make=${encodeURIComponent(s.make)}&model=${encodeURIComponent(s.model)}`); setOpen(false); } else submit(q); }}
        className="flex items-center gap-2 rounded-[var(--radius-md)] border border-line bg-white p-1.5 focus-within:border-charcoal">
        <Search className="ml-2 size-4 shrink-0 text-muted" />
        <label htmlFor="market-q" className="sr-only">Search vehicles</label>
        <input id="market-q" value={q} autoComplete="off" maxLength={300}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(-1); }}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, suggestions.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
            if (e.key === "Escape") setOpen(false);
          }}
          role="combobox" aria-expanded={open && suggestions.length > 0} aria-controls="market-suggestions" aria-autocomplete="list"
          placeholder="Search make, model or describe what you want…" className="h-10 min-w-0 flex-1 bg-transparent text-[14.5px] text-ink placeholder:text-muted focus:outline-none" />
        <button type="submit" disabled={pending} className="flex h-10 items-center gap-1.5 rounded-[var(--radius-sm)] bg-ink px-4 text-[13px] font-medium text-white hover:bg-graphite disabled:opacity-60">
          {pending ? <Loader2 className="size-4 animate-spin" /> : isNatural(q) ? <Sparkles className="size-4" /> : <Search className="size-4" />}
          <span className="hidden sm:inline">Search</span>
        </button>
      </form>
      {open && suggestions.length > 0 ? (
        <ul id="market-suggestions" role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-[var(--radius-md)] border border-line bg-white shadow-[var(--shadow-lift)]">
          {suggestions.map((s, i) => (
            <li key={s.label} role="option" aria-selected={i === active}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setOpen(false); router.push(`/cars?make=${encodeURIComponent(s.make)}&model=${encodeURIComponent(s.model)}`); }}
                className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-[13.5px] hover:bg-paper ${i === active ? "bg-paper" : ""}`}>
                <span className="text-ink">{s.label}</span><span className="text-[12px] text-muted">{s.listing_count} available</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {interpretation ? (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
          <Sparkles className="size-3.5 text-accent" /> Interpreted as: {interpretation.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
