"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Info, LineChart, Loader2, RefreshCw, X } from "lucide-react";
import { requestValuation, decideRecommendation, updatePricing } from "@/app/actions/seller";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input, Label } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatMileage, formatPercent, formatPrice } from "@/lib/format";
import { pricePositioning, POSITIONING_COPY } from "@/lib/pricing/engine";
import type { Comparable, PriceRecommendation, Valuation } from "@/lib/types";

const SOURCE_LABEL = (s: string) => s === "meridian_completed_sale" ? "Meridian completed sale" : s === "meridian_listing" ? "Meridian listing" : s.startsWith("licensed:") ? `Licensed data (${s.slice(9)})` : s;

export function ValuationPanel({ vehicleId, valuation, comparables, recommendations, askingPrice, minimumPrice, canRequest = true, canEditPrice = true }: {
  vehicleId: string; valuation: Valuation | null; comparables: Comparable[]; recommendations: PriceRecommendation[];
  askingPrice: number | null; minimumPrice: number | null; canRequest?: boolean; canEditPrice?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [asking, setAsking] = useState(askingPrice?.toString() ?? "");
  const [minimum, setMinimum] = useState(minimumPrice?.toString() ?? "");
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => start(async () => {
    setError(null); setMessage(null);
    const r = await fn();
    if (!r.ok) setError(r.error ?? "Something went wrong"); else if (r.message) setMessage(r.message);
    router.refresh();
  });
  const done = valuation?.valuation_status === "completed";
  const positioning = done && askingPrice ? pricePositioning(askingPrice, valuation) : null;
  const undecided = recommendations.filter((r) => r.approved_by_seller == null && r.valuation_id === valuation?.id);
  const range = done ? { min: valuation.market_value_min!, max: valuation.market_value_max! } : null;
  const span = range ? Math.max(range.max - (valuation!.fast_sale_price! * 0.97), 1) : 1;
  const pct = (n: number) => range ? `${Math.min(100, Math.max(0, ((n - valuation!.fast_sale_price! * 0.97) / span) * 100))}%` : "0%";

  return (
    <div className="space-y-6">
      {!valuation ? (
        <div className="rounded-[var(--radius-md)] border border-line bg-paper p-6 text-center">
          <LineChart className="mx-auto size-7 text-accent" strokeWidth={1.25} />
          <p className="mt-3 font-semibold text-ink">Get your indicative valuation</p>
          <p className="mx-auto mt-1 max-w-md text-[13.5px] text-muted">We compare your vehicle with real comparable vehicles. If there is not enough evidence, we will tell you rather than guess.</p>
          {canRequest ? <Button className="mt-5" onClick={() => run(() => requestValuation(vehicleId))} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null}Run valuation</Button> : null}
        </div>
      ) : valuation.valuation_status === "insufficient_data" ? (
        <Alert tone="warning" title="Not enough market evidence yet"
          action={canRequest ? <Button size="sm" variant="secondary" onClick={() => run(() => requestValuation(vehicleId))} disabled={pending}><RefreshCw />Retry</Button> : undefined}>
          <p>{valuation.valuation_explanation}</p>
          <ul className="mt-2 list-disc pl-4 text-[12.5px]">{valuation.data_limitations.map((l) => <li key={l}>{l}</li>)}</ul>
          <p className="mt-2 text-[12.5px]">You can still set your own asking price below. A Meridian specialist will review your vehicle.</p>
        </Alert>
      ) : (
        <div className="rounded-[var(--radius-md)] border border-line bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div><p className="font-semibold text-ink">Indicative valuation</p><p className="text-[12.5px] text-muted">{formatDate(valuation.created_at)} · {valuation.valuation_source} · engine {valuation.engine_version}</p></div>
            <div className="flex items-center gap-2">
              <Badge tone={(valuation.confidence_score ?? 0) >= 0.65 ? "success" : (valuation.confidence_score ?? 0) >= 0.45 ? "warning" : "danger"}>Confidence {formatPercent(valuation.confidence_score)}</Badge>
              {canRequest ? <Button size="sm" variant="ghost" onClick={() => run(() => requestValuation(vehicleId))} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}Request another</Button> : null}
            </div>
          </div>
          <div className="grid gap-px bg-line sm:grid-cols-3">
            {[["Market range", `${formatPrice(valuation.market_value_min)} – ${formatPrice(valuation.market_value_max)}`, "Typical advertised range for comparable vehicles"],
              ["Suggested asking price", formatPrice(valuation.recommended_asking_price), "In line with the market"],
              ["Fast-sale price", formatPrice(valuation.fast_sale_price), "Competitive positioning to attract serious buyers sooner"]].map(([l, v, d], i) => (
              <div key={l} className="bg-white p-5"><p className="eyebrow">{l}</p><p className={`mt-2 text-[22px] font-semibold tracking-[-0.02em] ${i === 2 ? "text-accent-strong" : "text-ink"}`}>{v}</p><p className="mt-1 text-[12px] text-muted">{d}</p></div>
            ))}
          </div>
          <div className="px-5 py-5">
            <div className="relative h-2 rounded-full bg-mist">
              <div className="absolute inset-y-0 rounded-full bg-silver/60" style={{ left: pct(range!.min), right: `calc(100% - ${pct(range!.max)})` }} />
              <div className="absolute -top-1 h-4 w-0.5 bg-accent" style={{ left: pct(valuation.fast_sale_price!) }} title="Fast-sale price" />
              <div className="absolute -top-1 h-4 w-0.5 bg-ink" style={{ left: pct(valuation.recommended_asking_price!) }} title="Suggested asking price" />
              {askingPrice ? <div className="absolute -top-2 size-3 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-white bg-info shadow" style={{ left: pct(askingPrice) }} title="Your price" /> : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-[11.5px] text-muted"><span className="flex items-center gap-1"><span className="h-3 w-0.5 bg-accent" />Fast sale</span><span className="flex items-center gap-1"><span className="h-3 w-0.5 bg-ink" />Suggested</span>{askingPrice ? <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-info" />Your price {formatPrice(askingPrice)}</span> : null}</div>
            {positioning ? <p className="mt-4 text-[13.5px] text-slate"><strong className="text-ink">{POSITIONING_COPY[positioning].label}:</strong> {POSITIONING_COPY[positioning].description}</p> : null}
            <p className="mt-4 whitespace-pre-line text-[13.5px] leading-relaxed text-slate">{valuation.valuation_explanation}</p>
            {valuation.data_limitations.length ? (
              <details className="mt-4 text-[12.5px] text-muted"><summary className="cursor-pointer font-medium text-charcoal">Data limitations</summary><ul className="mt-2 list-disc space-y-1 pl-4">{valuation.data_limitations.map((l) => <li key={l}>{l}</li>)}</ul></details>
            ) : null}
          </div>
          {comparables.length ? (
            <details className="border-t border-line">
              <summary className="cursor-pointer px-5 py-3 text-[13px] font-medium text-charcoal">Comparable evidence ({comparables.length})</summary>
              <Table>
                <THead><tr><TH>Vehicle</TH><TH>Mileage</TH><TH>Source</TH><TH>Date</TH><TH className="text-right">Observed</TH><TH className="text-right">Adjusted</TH></tr></THead>
                <TBody>
                  {comparables.map((c) => {
                    const d = c.vehicle_details as { year?: number; make?: string; model?: string; derivative?: string; mileage?: number };
                    return (
                      <TR key={c.id}>
                        <TD>{d.year} {d.make} {d.model}{d.derivative ? <span className="block text-[12px] text-muted">{d.derivative}</span> : null}</TD>
                        <TD>{formatMileage(d.mileage)}</TD>
                        <TD><span className="text-[12.5px]">{SOURCE_LABEL(c.source_provider)}</span><span className="block text-[11.5px] text-muted">{c.price_type === "sold" ? "Sold price" : "Asking price"}</span></TD>
                        <TD>{formatDate(c.source_date)}</TD>
                        <TD className="text-right">{formatPrice(c.observed_price)}</TD>
                        <TD className="text-right font-medium">{formatPrice(c.adjusted_price)}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
              <p className="px-5 py-3 text-[11.5px] text-muted">Adjusted prices account for differences in age, mileage and condition. Individual comparable vehicles are not identified publicly.</p>
            </details>
          ) : null}
        </div>
      )}

      {undecided.length ? (
        <div className="rounded-[var(--radius-md)] border border-accent/40 bg-accent-soft/40 p-5">
          <p className="font-semibold text-ink">Price recommendations</p>
          <p className="mt-0.5 text-[13px] text-slate">Accept a recommendation to use it as your asking price, or set your own below. Nothing changes without your decision.</p>
          <ul className="mt-4 space-y-3">
            {undecided.map((r) => (
              <li key={r.id} className="flex flex-col justify-between gap-3 rounded-[var(--radius-sm)] border border-line bg-white p-4 sm:flex-row sm:items-center">
                <div><p className="text-[13px] text-muted">{r.recommendation_type === "fast_sale" ? "Fast-sale price" : r.recommendation_type === "price_review" ? "Price review" : "Suggested asking price"}</p>
                  <p className="text-lg font-semibold text-ink">{formatPrice(r.recommended_price)}</p>{r.explanation ? <p className="text-[12.5px] text-muted">{r.explanation}</p> : null}</div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => run(() => decideRecommendation(r.id, true))} disabled={pending}><Check />Accept</Button>
                  <Button size="sm" variant="secondary" onClick={() => run(() => decideRecommendation(r.id, false))} disabled={pending}><X />Decline</Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canEditPrice ? (
        <form className="rounded-[var(--radius-md)] border border-line bg-white p-5" onSubmit={(e) => { e.preventDefault(); run(() => updatePricing(vehicleId, Number(asking), Number(minimum))); }}>
          <p className="font-semibold text-ink">Your pricing</p>
          <p className="mt-0.5 text-[13px] text-muted">Your minimum is private. Meridian will never reduce your price without your permission, and never below this minimum.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div><Label htmlFor="ask">Asking price (£)</Label><Input id="ask" inputMode="numeric" value={asking} onChange={(e) => setAsking(e.target.value.replace(/[^\d]/g, ""))} /></div>
            <div><Label htmlFor="min">Minimum authorised price (£)</Label><Input id="min" inputMode="numeric" value={minimum} onChange={(e) => setMinimum(e.target.value.replace(/[^\d]/g, ""))} /></div>
            <Button type="submit" disabled={pending || !asking || !minimum}>Save pricing</Button>
          </div>
        </form>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}
      <p className="flex items-start gap-2 text-[12px] text-muted"><Info className="mt-0.5 size-3.5 shrink-0" />Valuations are indicative estimates based on available evidence. They are not a guaranteed sale price, and we never guarantee a sale within a particular timeframe.</p>
    </div>
  );
}
