import { requireStaff, isAdminRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toggleProvider } from "@/app/actions/admin";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { DefinitionList, PageHeader } from "@/components/ui/misc";
import { SimpleAction } from "@/components/admin/controls";
import { ENGINE_VERSION } from "@/lib/pricing/engine";
import { formatPrice } from "@/lib/format";

export const metadata = { title: "Pricing engine" };

export default async function PricingPage() {
  const session = await requireStaff();
  const supabase = await createClient();
  const [{ data: settings }, { data: providers }] = await Promise.all([
    supabase.from("platform_settings").select("setting_key, setting_value").or("setting_key.like.pricing.%,setting_key.like.fees.%,setting_key.like.matching.%"),
    supabase.from("data_providers").select("*").order("id"),
  ]);
  const get = (k: string) => settings?.find((s) => s.setting_key === k)?.setting_value;
  const tiers = (get("fees.sale_fee_tiers") ?? []) as { min: number; max: number | null; fee: number }[];
  return (
    <>
      <PageHeader eyebrow="Intelligence" title="Fast Sale pricing engine" description={`Deterministic engine ${ENGINE_VERSION}. AI is used only to word explanations, and any AI wording that introduces a figure not produced by the engine is discarded.`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Engine configuration" description="Editable in Settings (admins)." /><CardBody><DefinitionList className="!grid-cols-1" items={[
          { label: "Minimum comparables", value: String(get("pricing.min_comparables")) }, { label: "Year tolerance", value: `± ${get("pricing.year_tolerance")} years` },
          { label: "Mileage tolerance", value: `± ${Number(get("pricing.mileage_tolerance_pct")) * 100}%` }, { label: "Fast-sale percentile", value: `P${Number(get("pricing.fast_sale_percentile")) * 100}` },
          { label: "Valuation validity", value: `${get("pricing.valuation_validity_days")} days` },
        ]} />
          <ul className="mt-4 list-disc space-y-1 pl-5 text-[12.5px] text-slate"><li>Comparables must share make, model, fuel and transmission and be within the year/mileage window and 12 months old.</li><li>Adjustments: ~4.5% per 10k miles, ~7.5% per model year, condition ratio, service history factor.</li><li>Sold prices ×1.03 to asking-equivalent; recency half-life 90 days; outliers removed with Tukey fences.</li><li>Confidence is capped at 92% — the engine never claims certainty.</li></ul>
        </CardBody></Card>
        <Card><CardHeader title="Success fee tiers" /><CardBody><ul className="space-y-1 text-[13.5px]">{tiers.map((t) => <li key={t.min} className="flex justify-between border-b border-line py-1.5"><span>{formatPrice(t.min)}{t.max ? `–${formatPrice(t.max)}` : "+"}</span><strong>{formatPrice(t.fee)}</strong></li>)}</ul>
          <p className="mt-3 text-[12px] text-muted">Payable when: sale completed (seller + staff confirmation).</p></CardBody></Card>
        <Card className="lg:col-span-2"><CardHeader title="Comparable data sources" />
          <CardBody>
            <Alert tone="neutral" className="mb-4">Built-in sources: Meridian completed sales and Meridian marketplace listings. Licensed third-party sources require a provider contract and an implementation in <code>src/lib/pricing/providers.ts</code>. The database rejects comparables from providers that are not enabled. Competitor marketplaces are never scraped.</Alert>
            {(providers ?? []).length ? <ul className="space-y-2">{(providers ?? []).map((p) => <li key={p.id} className="flex items-center justify-between rounded-[var(--radius-sm)] border border-line p-3 text-[13.5px]"><span><strong>{p.display_name}</strong> <span className="text-muted">({p.provider_type}) {p.licence_reference ?? ""}</span></span>
              <span className="flex items-center gap-2"><Badge tone={p.is_enabled ? "success" : "neutral"}>{p.is_enabled ? "Enabled" : "Disabled"}</Badge>{isAdminRole(session.profile.role) ? <SimpleAction label={p.is_enabled ? "Disable" : "Enable"} action={toggleProvider.bind(null, p.id, !p.is_enabled)} /> : null}</span></li>)}</ul>
              : <p className="text-[13px] text-muted">No licensed providers registered.</p>}
          </CardBody></Card>
      </div>
    </>
  );
}
