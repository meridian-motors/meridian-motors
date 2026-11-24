"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { BODY_LABELS, CONDITION_LABELS, FUEL_LABELS, TRANSMISSION_LABELS } from "@/lib/constants";
import { filtersToQuery } from "@/lib/search/filters";
import type { MarketplaceFilters } from "@/lib/types";
import { cn } from "@/lib/utils";

type Facets = { makes: { make: string; count: number }[]; models: { make: string; model: string; count: number }[] };

const PRICE_STEPS = [1000, 2000, 3000, 5000, 7500, 10000, 12500, 15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000];
const MILEAGE_STEPS = [10000, 20000, 30000, 40000, 60000, 80000, 100000, 150000];
const thisYear = new Date().getFullYear();
const YEARS = Array.from({ length: 30 }, (_, i) => thisYear - i);

function FilterForm({ filters, facets, onApply }: { filters: MarketplaceFilters; facets: Facets; onApply: (f: MarketplaceFilters) => void }) {
  const [f, setF] = useState<MarketplaceFilters>(filters);
  useEffect(() => setF(filters), [filters]);
  const set = <K extends keyof MarketplaceFilters>(k: K, v: MarketplaceFilters[K]) => setF((p) => ({ ...p, [k]: v === "" ? undefined : v, page: undefined }));
  const toggle = <K extends "fuel" | "transmission" | "body" | "condition">(k: K, v: string) =>
    setF((p) => {
      const cur = (p[k] ?? []) as string[];
      const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
      return { ...p, [k]: next.length ? next : undefined, page: undefined };
    });
  const models = useMemo(() => facets.models.filter((m) => !f.make || m.make.toLowerCase() === f.make.toLowerCase()), [facets.models, f.make]);
  const num = (v: string) => (v ? Number(v) : undefined);

  const Chips = ({ k, labels }: { k: "fuel" | "transmission" | "body" | "condition"; labels: Record<string, string> }) => (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(labels).filter(([v]) => v !== "other").map(([v, label]) => {
        const on = ((f[k] ?? []) as string[]).includes(v);
        return (
          <button type="button" key={v} onClick={() => toggle(k, v)} aria-pressed={on}
            className={cn("rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-[12.5px] transition-colors", on ? "border-ink bg-ink text-white" : "border-line bg-white text-slate hover:border-silver")}>
            {label}
          </button>
        );
      })}
    </div>
  );

  return (
    <form onSubmit={(e) => { e.preventDefault(); onApply(f); }} className="space-y-6">
      <div className="grid grid-cols-1 gap-3">
        <div>
          <Label htmlFor="f-make">Make</Label>
          <Select id="f-make" value={f.make ?? ""} onChange={(e) => setF((p) => ({ ...p, make: e.target.value || undefined, model: undefined, page: undefined }))}>
            <option value="">Any make</option>
            {facets.makes.map((m) => <option key={m.make} value={m.make}>{m.make} ({m.count})</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="f-model">Model</Label>
          <Select id="f-model" value={f.model ?? ""} onChange={(e) => set("model", e.target.value)} disabled={!f.make}>
            <option value="">{f.make ? "Any model" : "Select a make first"}</option>
            {models.map((m) => <option key={`${m.make}-${m.model}`} value={m.model}>{m.model} ({m.count})</option>)}
          </Select>
        </div>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-charcoal">Price</legend>
        <div className="grid grid-cols-2 gap-2">
          <Select aria-label="Minimum price" value={f.minPrice ?? ""} onChange={(e) => set("minPrice", num(e.target.value))}>
            <option value="">No min</option>{PRICE_STEPS.map((p) => <option key={p} value={p}>£{p.toLocaleString("en-GB")}</option>)}
          </Select>
          <Select aria-label="Maximum price" value={f.maxPrice ?? ""} onChange={(e) => set("maxPrice", num(e.target.value))}>
            <option value="">No max</option>{PRICE_STEPS.map((p) => <option key={p} value={p}>£{p.toLocaleString("en-GB")}</option>)}
          </Select>
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-charcoal">Year</legend>
        <div className="grid grid-cols-2 gap-2">
          <Select aria-label="Minimum year" value={f.minYear ?? ""} onChange={(e) => set("minYear", num(e.target.value))}>
            <option value="">From any</option>{YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
          <Select aria-label="Maximum year" value={f.maxYear ?? ""} onChange={(e) => set("maxYear", num(e.target.value))}>
            <option value="">To any</option>{YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </div>
      </fieldset>
      <div>
        <Label htmlFor="f-mileage">Maximum mileage</Label>
        <Select id="f-mileage" value={f.maxMileage ?? ""} onChange={(e) => set("maxMileage", num(e.target.value))}>
          <option value="">Any mileage</option>{MILEAGE_STEPS.map((m) => <option key={m} value={m}>Up to {m.toLocaleString("en-GB")} miles</option>)}
        </Select>
      </div>
      <fieldset><legend className="mb-2 text-[13px] font-medium text-charcoal">Fuel type</legend><Chips k="fuel" labels={FUEL_LABELS} /></fieldset>
      <fieldset><legend className="mb-2 text-[13px] font-medium text-charcoal">Transmission</legend><Chips k="transmission" labels={TRANSMISSION_LABELS} /></fieldset>
      <fieldset><legend className="mb-2 text-[13px] font-medium text-charcoal">Body type</legend><Chips k="body" labels={BODY_LABELS} /></fieldset>
      <fieldset><legend className="mb-2 text-[13px] font-medium text-charcoal">Condition (seller declared)</legend><Chips k="condition" labels={CONDITION_LABELS} /></fieldset>
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-charcoal">Location</legend>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Input aria-label="Your postcode" placeholder="Postcode e.g. M1 1AE" value={f.postcode ?? ""} onChange={(e) => set("postcode", e.target.value.toUpperCase())} maxLength={8} />
          <Select aria-label="Distance" value={f.radius ?? ""} onChange={(e) => set("radius", num(e.target.value))} className="w-28">
            <option value="">50 mi</option>{[10, 25, 50, 100, 200].map((r) => <option key={r} value={r}>{r} mi</option>)}
          </Select>
        </div>
        <Input aria-label="Town or city" placeholder="…or town / city" className="mt-2" value={f.location ?? ""} onChange={(e) => set("location", e.target.value)} maxLength={80} />
      </fieldset>
      <div className="sticky bottom-0 -mx-1 flex gap-2 bg-white px-1 pb-1 pt-3">
        <Button type="submit" className="flex-1">Show results</Button>
        <Button type="button" variant="secondary" onClick={() => onApply({ q: filters.q, sort: filters.sort })}>Clear</Button>
      </div>
    </form>
  );
}

export function MarketplaceFiltersPanel({ filters, facets }: { filters: MarketplaceFilters; facets: Facets }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const apply = (f: MarketplaceFilters) => { setOpen(false); start(() => router.push(`/cars?${filtersToQuery({ ...f, page: undefined })}`, { scroll: false })); };
  return (
    <>
      <aside className={cn("hidden lg:block", pending && "opacity-60")} aria-label="Filters">
        <div className="sticky top-24 rounded-[var(--radius-md)] border border-line bg-white p-5">
          <p className="mb-5 text-[13px] font-semibold uppercase tracking-[0.12em] text-ink">Filters</p>
          <FilterForm filters={filters} facets={facets} onApply={apply} />
        </div>
      </aside>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary" className="lg:hidden"><SlidersHorizontal /> Filters</Button>
        </DialogTrigger>
        <DialogContent title="Filters" side="right"><FilterForm filters={filters} facets={facets} onApply={apply} /></DialogContent>
      </Dialog>
    </>
  );
}

export function ActiveFilterChips({ filters }: { filters: MarketplaceFilters }) {
  const router = useRouter();
  const params = useSearchParams();
  const chips: { key: keyof MarketplaceFilters; label: string; value?: string }[] = [];
  const f = filters;
  if (f.q) chips.push({ key: "q", label: `“${f.q}”` });
  if (f.make) chips.push({ key: "make", label: f.make });
  if (f.model) chips.push({ key: "model", label: f.model });
  if (f.minPrice) chips.push({ key: "minPrice", label: `From £${f.minPrice.toLocaleString("en-GB")}` });
  if (f.maxPrice) chips.push({ key: "maxPrice", label: `Up to £${f.maxPrice.toLocaleString("en-GB")}` });
  if (f.minYear) chips.push({ key: "minYear", label: `From ${f.minYear}` });
  if (f.maxYear) chips.push({ key: "maxYear", label: `To ${f.maxYear}` });
  if (f.maxMileage) chips.push({ key: "maxMileage", label: `< ${f.maxMileage.toLocaleString("en-GB")} mi` });
  f.fuel?.forEach((v) => chips.push({ key: "fuel", label: FUEL_LABELS[v], value: v }));
  f.transmission?.forEach((v) => chips.push({ key: "transmission", label: TRANSMISSION_LABELS[v], value: v }));
  f.body?.forEach((v) => chips.push({ key: "body", label: BODY_LABELS[v], value: v }));
  f.condition?.forEach((v) => chips.push({ key: "condition", label: CONDITION_LABELS[v], value: v }));
  if (f.postcode) chips.push({ key: "postcode", label: `Within ${f.radius ?? 50} mi of ${f.postcode}` });
  if (f.location) chips.push({ key: "location", label: f.location });
  if (!chips.length) return null;
  const remove = (c: (typeof chips)[number]) => {
    const next: MarketplaceFilters = { ...f, page: undefined };
    if (c.value && Array.isArray(next[c.key])) (next[c.key] as unknown) = (next[c.key] as string[]).filter((x) => x !== c.value);
    else (next[c.key] as unknown) = undefined;
    if (c.key === "make") next.model = undefined;
    if (c.key === "postcode") next.radius = undefined;
    router.push(`/cars?${filtersToQuery(next)}${params.get("ai") ? "&ai=1" : ""}`, { scroll: false });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button key={`${c.key}-${c.value ?? ""}`} onClick={() => remove(c)} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white py-1 pl-3 pr-2 text-[12.5px] text-charcoal hover:border-silver">
          {c.label}<X className="size-3 text-muted" aria-label="Remove filter" />
        </button>
      ))}
      <button onClick={() => router.push("/cars")} className="text-[12.5px] text-muted underline-offset-4 hover:text-ink hover:underline">Clear all</button>
    </div>
  );
}

export function SortSelect({ filters }: { filters: MarketplaceFilters }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="sort" className="mb-0 whitespace-nowrap text-muted">Sort by</Label>
      <Select id="sort" className="w-44" value={filters.sort ?? (filters.q ? "relevance" : "newest")}
        onChange={(e) => router.push(`/cars?${filtersToQuery({ ...filters, sort: e.target.value as MarketplaceFilters["sort"], page: undefined })}`, { scroll: false })}>
        <option value="newest">Newest listed</option>
        <option value="price_asc">Lowest price</option>
        <option value="price_desc">Highest price</option>
        <option value="mileage_asc">Lowest mileage</option>
        <option value="relevance">Most relevant</option>
        {filters.postcode ? <option value="distance">Nearest</option> : null}
      </Select>
    </div>
  );
}
