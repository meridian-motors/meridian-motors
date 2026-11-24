"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, CheckCircle2, ChevronLeft, ChevronRight, Cloud, Loader2, Plus, Search, X } from "lucide-react";
import { autosaveStep, saveStep, dvlaLookup, submitVehicle } from "@/app/actions/seller";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { DefinitionList } from "@/components/ui/misc";
import { ImageManager, DocumentManager, type ImageRow, type DocumentRow } from "./uploaders";
import { ValuationPanel } from "./valuation-panel";
import { STEPS, MIN_PHOTOS } from "@/lib/validation/vehicle";
import { BODY_LABELS, CONDITION_LABELS, FUEL_LABELS, POPULAR_MAKES, SERVICE_HISTORY_LABELS, TRANSMISSION_LABELS } from "@/lib/constants";
import { formatMileage, formatPrice } from "@/lib/format";
import type { Comparable, PriceRecommendation, SaleTerms, Valuation, Vehicle } from "@/lib/types";
import { cn } from "@/lib/utils";

type V = Record<string, unknown>;
type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const COMMON_FEATURES = ["Apple CarPlay", "Android Auto", "Sat nav", "Heated seats", "Leather seats", "Parking sensors", "Reversing camera", "Adaptive cruise control",
  "Cruise control", "Panoramic roof", "Sunroof", "Bluetooth", "Climate control", "Keyless entry", "LED headlights", "Alloy wheels", "Tow bar", "Isofix", "Heated steering wheel", "Blind spot monitoring"];

function initialValues(step: Step, v: Vehicle, t: SaleTerms | null): V {
  const saved = (v.submission_data?.[`step${step}`] as V | undefined) ?? {};
  const str = (x: unknown) => (x == null ? "" : String(x));
  const base: Record<number, V> = {
    1: { registration_number: str(v.registration_number), make: str(v.make), model: str(v.model), derivative: str(v.derivative), year: str(v.year), vin: str(v.vin) },
    2: { mileage: str(v.mileage), fuel_type: str(v.fuel_type), transmission: str(v.transmission), engine_size: str(v.engine_size), body_type: str(v.body_type), colour: str(v.colour), doors: str(v.doors), seats: str(v.seats), specification: v.specification ?? [] },
    3: { condition: str(v.condition), cosmetic_damage: str(v.cosmetic_damage), mechanical_issues: str(v.mechanical_issues), accident_history: str(v.accident_history),
      has_outstanding_finance: v.has_outstanding_finance == null ? "" : v.has_outstanding_finance ? "yes" : "no", modifications: str(v.modifications), other_disclosures: str(v.other_disclosures), disclosures_confirmed: !!v.disclosures_confirmed_at },
    4: { service_history: v.service_history ?? "unknown", service_history_notes: str(v.service_history_notes), mot_expiry: str(v.mot_expiry), previous_keepers: str(v.previous_keepers) },
    6: { location: str(v.location), postcode: str(v.postcode), desired_asking_price: str(t?.desired_asking_price), expected_selling_price: str(t?.expected_selling_price),
      minimum_authorised_price: str(t?.minimum_authorised_price), preferred_contact_method: t?.preferred_contact_method ?? "platform_messages", seller_comments: str(t?.seller_comments), description: str(v.description) },
  };
  // Autosaved (unvalidated) values take precedence only where the column is still empty.
  const b = base[step] ?? {};
  const dvla = (v.submission_data as { dvla?: { colour?: string; fuelType?: string; engineCapacity?: number; motExpiryDate?: string } }).dvla;
  if (dvla && step === 2) {
    const fuel = ({ PETROL: "petrol", DIESEL: "diesel", ELECTRICITY: "electric", "HYBRID ELECTRIC": "hybrid" } as Record<string, string>)[dvla.fuelType ?? ""];
    if (!b.colour && dvla.colour) b.colour = dvla.colour.charAt(0) + dvla.colour.slice(1).toLowerCase();
    if (!b.fuel_type && fuel) b.fuel_type = fuel;
    if (!b.engine_size && dvla.engineCapacity) b.engine_size = String(dvla.engineCapacity);
  }
  if (dvla?.motExpiryDate && step === 4 && !b.mot_expiry) b.mot_expiry = dvla.motExpiryDate;
  for (const [k, val] of Object.entries(saved)) if (b[k] === "" || b[k] == null) b[k] = val;
  return b;
}

export function SubmissionWizard({ vehicle, terms, images, documents, valuation, comparables, recommendations, initialStep, dvlaConfigured }: {
  vehicle: Vehicle; terms: SaleTerms | null; images: ImageRow[]; documents: DocumentRow[]; valuation: Valuation | null; comparables: Comparable[];
  recommendations: PriceRecommendation[]; initialStep: Step; dvlaConfigured: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initialStep);
  const [values, setValues] = useState<V>(() => initialValues(initialStep, vehicle, terms));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [pending, start] = useTransition();
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const maxReached = Math.max(vehicle.submission_step, initialStep);

  useEffect(() => { setValues(initialValues(step, vehicle, terms)); setErrors({}); setFormError(null); dirty.current = false; }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced autosave
  useEffect(() => {
    if (!dirty.current || [5, 7, 8].includes(step)) return;
    clearTimeout(timer.current);
    setSaveState("saving");
    timer.current = setTimeout(async () => { await autosaveStep(vehicle.id, step, values); setSaveState("saved"); }, 1200);
    return () => clearTimeout(timer.current);
  }, [values, step, vehicle.id]);

  const set = (k: string, v: unknown) => { dirty.current = true; setValues((p) => ({ ...p, [k]: v })); setErrors((e) => ({ ...e, [k]: "" })); };
  const goto = (s: Step) => { setStep(s); router.replace(`/dashboard/vehicles/${vehicle.id}/submit?step=${s}`, { scroll: false }); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const next = () => start(async () => {
    setFormError(null);
    clearTimeout(timer.current);
    setSaveState("idle");
    const res = await saveStep(vehicle.id, step, values);
    if (!res.ok) { setErrors(res.fieldErrors ?? {}); setFormError(res.error); return; }
    dirty.current = false;
    router.refresh();
    goto((step + 1) as Step);
  });

  const field = (name: string, label: string, el: React.ReactNode, opts?: { required?: boolean; hint?: React.ReactNode; className?: string }) => (
    <Field label={label} htmlFor={name} error={errors[name]} required={opts?.required} hint={opts?.hint} className={opts?.className}>{el}</Field>
  );
  const text = (name: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Input id={name} value={String(values[name] ?? "")} onChange={(e) => set(name, e.target.value)} aria-invalid={!!errors[name]} {...props} />
  );
  const area = (name: string, rows = 3, placeholder?: string) => (
    <Textarea id={name} rows={rows} value={String(values[name] ?? "")} onChange={(e) => set(name, e.target.value)} placeholder={placeholder} maxLength={2000} aria-invalid={!!errors[name]} />
  );
  const select = (name: string, options: Record<string, string>, placeholder = "Select…") => (
    <Select id={name} value={String(values[name] ?? "")} onChange={(e) => set(name, e.target.value)} aria-invalid={!!errors[name]}>
      <option value="">{placeholder}</option>{Object.entries(options).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </Select>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
      <nav aria-label="Submission steps" className="lg:sticky lg:top-8 lg:self-start">
        <ol className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:gap-0 lg:overflow-visible">
          {STEPS.map((s) => {
            const done = s.n < maxReached && s.n !== step;
            const reachable = s.n <= maxReached;
            return (
              <li key={s.n} className="shrink-0">
                <button type="button" disabled={!reachable} onClick={() => goto(s.n as Step)} aria-current={s.n === step ? "step" : undefined}
                  className={cn("flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed",
                    s.n === step ? "bg-ink text-white" : reachable ? "hover:bg-mist" : "opacity-50")}>
                  <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                    s.n === step ? "border-white/30" : done ? "border-success bg-success text-white" : "border-line bg-white text-muted")}>
                    {done ? <Check className="size-3.5" /> : s.n}
                  </span>
                  <span className="hidden lg:block"><span className="block text-[13.5px] font-medium">{s.title}</span><span className={cn("block text-[11.5px]", s.n === step ? "text-white/60" : "text-muted")}>{s.description}</span></span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="min-w-0 rounded-[var(--radius-md)] border border-line bg-white">
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 sm:px-7">
          <div><p className="eyebrow">Step {step} of 8</p><h2 className="mt-1 text-xl font-semibold">{STEPS[step - 1].title}</h2></div>
          <p className="flex items-center gap-1.5 text-[12px] text-muted" aria-live="polite">
            {saveState === "saving" ? <><Loader2 className="size-3.5 animate-spin" />Saving…</> : saveState === "saved" ? <><Cloud className="size-3.5" />Draft saved</> : null}
          </p>
        </div>

        <div className="space-y-5 px-5 py-6 sm:px-7">
          {step === 1 ? <Step1 values={values} set={set} field={field} text={text} vehicleId={vehicle.id} dvlaConfigured={dvlaConfigured} /> : null}

          {step === 2 ? (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                {field("mileage", "Current mileage", text("mileage", { inputMode: "numeric", placeholder: "e.g. 42,000" }), { required: true, hint: "As shown on the odometer. You'll photograph it in step 5." })}
                {field("fuel_type", "Fuel type", select("fuel_type", FUEL_LABELS), { required: true })}
                {field("transmission", "Transmission", select("transmission", TRANSMISSION_LABELS), { required: true })}
                {field("body_type", "Body type", select("body_type", BODY_LABELS), { required: true })}
                {field("engine_size", "Engine size (cc)", text("engine_size", { inputMode: "numeric", placeholder: "e.g. 1498" }), { hint: "Leave blank for electric vehicles." })}
                {field("colour", "Colour", text("colour", { maxLength: 40 }))}
                {field("doors", "Doors", text("doors", { inputMode: "numeric", maxLength: 1 }))}
                {field("seats", "Seats", text("seats", { inputMode: "numeric", maxLength: 2 }))}
              </div>
              <FeaturePicker value={(values.specification as string[]) ?? []} onChange={(v) => set("specification", v)} />
            </>
          ) : null}

          {step === 3 ? (
            <>
              {field("condition", "Overall condition", select("condition", CONDITION_LABELS), { required: true, hint: "Be honest — accurate descriptions lead to smoother sales and fewer disputes." })}
              {field("cosmetic_damage", "Cosmetic damage", area("cosmetic_damage", 2, "e.g. small scuff on rear bumper, stone chips on bonnet. Leave blank if none."))}
              {field("mechanical_issues", "Known mechanical issues or warning lights", area("mechanical_issues", 2, "Leave blank if none."))}
              {field("accident_history", "Accident history", area("accident_history", 2, "Describe any accidents or repairs you are aware of. Leave blank if none."))}
              <fieldset>
                <legend className="mb-2 text-[13px] font-medium text-charcoal">Is there outstanding finance on the vehicle?<span className="ml-0.5 text-accent">*</span></legend>
                <div className="flex gap-3">
                  {[["no", "No"], ["yes", "Yes"]].map(([v, l]) => (
                    <label key={v} className={cn("flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border px-4 py-2.5 text-[14px]", values.has_outstanding_finance === v ? "border-ink" : "border-line")}>
                      <input type="radio" name="finance" checked={values.has_outstanding_finance === v} onChange={() => set("has_outstanding_finance", v)} className="accent-ink" />{l}
                    </label>
                  ))}
                </div>
                {errors.has_outstanding_finance ? <p className="mt-1.5 text-[12.5px] text-danger">{errors.has_outstanding_finance}</p> : null}
                {values.has_outstanding_finance === "yes" ? <p className="mt-2 text-[12.5px] text-muted">Finance must be settled before or at the point of sale. We&apos;ll explain the options.</p> : null}
              </fieldset>
              {field("modifications", "Modifications", area("modifications", 2, "Any non-standard parts or changes. Leave blank if none."))}
              {field("other_disclosures", "Anything else a buyer should know", area("other_disclosures", 2))}
              <div>
                <Checkbox checked={!!values.disclosures_confirmed} onChange={(e) => set("disclosures_confirmed", e.target.checked)}
                  label="I confirm these disclosures are accurate and complete to the best of my knowledge"
                  description="Disclosures are shown on your listing. Misdescribing a vehicle may give a buyer a legal claim." />
                {errors.disclosures_confirmed ? <p className="mt-1.5 text-[12.5px] text-danger">{errors.disclosures_confirmed}</p> : null}
              </div>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                {field("service_history", "Service history", select("service_history", SERVICE_HISTORY_LABELS, "Select…"), { required: true })}
                {field("previous_keepers", "Previous keepers (if known)", text("previous_keepers", { inputMode: "numeric" }), { hint: "From your V5C logbook." })}
                {field("mot_expiry", "MOT expiry date", text("mot_expiry", { type: "date" }), { hint: (vehicle.submission_data as { dvla?: { motExpiryDate?: string } }).dvla?.motExpiryDate ? `DVLA records show ${(vehicle.submission_data as { dvla: { motExpiryDate: string } }).dvla.motExpiryDate}. Matching dates are shown as verified.` : "Leave blank if the vehicle doesn't need an MOT yet." })}
              </div>
              {field("service_history_notes", "Service history details", area("service_history_notes", 3, "e.g. Main dealer serviced at 10k, 20k, 30k; cambelt replaced at 60k."))}
              <div>
                <p className="mb-2 text-[13px] font-medium text-charcoal">Supporting documents (optional)</p>
                <DocumentManager vehicleId={vehicle.id} documents={documents} />
              </div>
            </>
          ) : null}

          {step === 5 ? (
            <>
              <Alert tone="neutral" title={`Add at least ${MIN_PHOTOS} photographs`}>
                Good photographs make the biggest difference to enquiries. Include the front, back and both sides, the interior, the dashboard and the <strong>mileage display</strong>, plus any damage you have disclosed. Avoid showing your number plate if you prefer — we don&apos;t display registrations.
              </Alert>
              <ImageManager vehicleId={vehicle.id} images={images} />
              <p className="text-[12.5px] text-muted">{images.length} photograph{images.length === 1 ? "" : "s"} added{images.length < MIN_PHOTOS ? ` — ${MIN_PHOTOS - images.length} more needed` : ""}.</p>
            </>
          ) : null}

          {step === 6 ? (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                {field("location", "Town or city", text("location", { autoComplete: "address-level2" }), { required: true, hint: "Shown on your listing." })}
                {field("postcode", "Postcode", text("postcode", { autoComplete: "postal-code", maxLength: 8, onChange: (e) => set("postcode", e.target.value.toUpperCase()) }), { required: true, hint: "Only the district (e.g. SW1A) is ever shown publicly." })}
                {field("desired_asking_price", "Desired asking price (£)", text("desired_asking_price", { inputMode: "numeric" }), { required: true })}
                {field("expected_selling_price", "Price you expect to achieve (£)", text("expected_selling_price", { inputMode: "numeric" }), { hint: "Private — helps us advise you." })}
                {field("minimum_authorised_price", "Minimum price you would accept (£)", text("minimum_authorised_price", { inputMode: "numeric" }), { required: true, hint: "Private. Your price will never be set below this." })}
                {field("preferred_contact_method", "Preferred contact method", select("preferred_contact_method", { platform_messages: "Meridian messages", email: "Email", phone: "Phone" }))}
              </div>
              {field("description", "Describe your vehicle in your own words", <Textarea id="description" rows={5} maxLength={6000} value={String(values.description ?? "")} onChange={(e) => set("description", e.target.value)} />, { hint: "Optional. We can also prepare a professional description from your confirmed details for you to approve." })}
              {field("seller_comments", "Anything else for the Meridian team", area("seller_comments", 2, "e.g. availability for viewings. Not shown publicly."))}
            </>
          ) : null}

          {step === 7 ? (
            <ValuationPanel vehicleId={vehicle.id} valuation={valuation} comparables={comparables} recommendations={recommendations}
              askingPrice={terms?.desired_asking_price ?? null} minimumPrice={terms?.minimum_authorised_price ?? null} />
          ) : null}

          {step === 8 ? <Review vehicle={vehicle} terms={terms} images={images.length} onSubmitted={() => router.push(`/dashboard/vehicles/${vehicle.id}?submitted=1`)} goto={goto} /> : null}

          {formError ? <Alert tone="danger">{formError}</Alert> : null}
        </div>

        {step < 8 ? (
          <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-4 sm:px-7">
            {step > 1 ? <Button variant="ghost" onClick={() => goto((step - 1) as Step)}><ChevronLeft />Back</Button> : <Button asChild variant="ghost"><Link href="/dashboard/vehicles">Save &amp; exit</Link></Button>}
            <Button onClick={next} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null}{step === 7 ? "Continue to review" : "Save and continue"}<ChevronRight /></Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Step1({ values, set, field, text, vehicleId, dvlaConfigured }: {
  values: V; set: (k: string, v: unknown) => void; vehicleId: string; dvlaConfigured: boolean;
  field: (n: string, l: string, el: React.ReactNode, o?: { required?: boolean; hint?: React.ReactNode }) => React.ReactNode;
  text: (n: string, p?: React.InputHTMLAttributes<HTMLInputElement>) => React.ReactNode;
}) {
  const [pending, start] = useTransition();
  const [lookup, setLookup] = useState<{ ok: boolean; msg: string } | null>(null);
  const thisYear = new Date().getFullYear();
  const doLookup = () => start(async () => {
    const r = await dvlaLookup(vehicleId, String(values.registration_number ?? ""));
    if (!r.ok) return setLookup({ ok: false, msg: r.error });
    const d = r.data!;
    if (d.make) set("make", d.make);
    if (d.year) set("year", String(d.year));
    setLookup({ ok: true, msg: `Found on DVLA records: ${[d.make, d.colour, d.fuel_type, d.year].filter(Boolean).join(", ")}${d.mot_expiry ? ` · MOT until ${d.mot_expiry}` : ""}. Please check and complete the remaining details. A DVLA lookup does not confirm ownership.` });
  });
  return (
    <>
      <div>
        <label htmlFor="registration_number" className="mb-1.5 block text-[13px] font-medium text-charcoal">Registration number<span className="ml-0.5 text-accent">*</span></label>
        <div className="flex gap-2">
          <div className="flex h-12 flex-1 items-stretch overflow-hidden rounded-[var(--radius-sm)] border-2 border-ink bg-[#F7D417] sm:max-w-xs">
            <span className="flex w-9 items-center justify-center bg-[#0B3D91] text-[10px] font-bold text-white">UK</span>
            <input id="registration_number" value={String(values.registration_number ?? "")} onChange={(e) => set("registration_number", e.target.value.toUpperCase())} maxLength={10}
              className="min-w-0 flex-1 bg-transparent px-3 font-mono text-xl font-bold uppercase tracking-[0.12em] text-ink placeholder:text-ink/30 focus:outline-none" placeholder="AB12 CDE" autoComplete="off" />
          </div>
          {dvlaConfigured ? <Button type="button" variant="secondary" className="h-12" onClick={doLookup} disabled={pending || String(values.registration_number ?? "").length < 2}>{pending ? <Loader2 className="animate-spin" /> : <Search />}Look up</Button> : null}
        </div>
        <p className="mt-1.5 text-[12.5px] text-muted">{dvlaConfigured ? "We can fetch details held by the DVLA. Your registration is never shown publicly." : "Your registration is never shown publicly. (Automatic DVLA lookup is not yet enabled — please enter details manually.)"}</p>
        {lookup ? <Alert tone={lookup.ok ? "success" : "warning"} className="mt-3">{lookup.msg}</Alert> : null}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {field("make", "Make", <><Input id="make" list="makes" value={String(values.make ?? "")} onChange={(e) => set("make", e.target.value)} /><datalist id="makes">{POPULAR_MAKES.map((m) => <option key={m} value={m} />)}</datalist></>, { required: true })}
        {field("model", "Model", text("model", { placeholder: "e.g. Golf" }), { required: true })}
        {field("derivative", "Trim / derivative", text("derivative", { placeholder: "e.g. 1.5 TSI Life DSG" }), { hint: "As shown on your V5C or service book." })}
        {field("year", "Year of registration", text("year", { inputMode: "numeric", maxLength: 4, placeholder: String(thisYear - 5) }), { required: true })}
      </div>
      {field("vin", "VIN (optional)", text("vin", { maxLength: 17, className: "font-mono uppercase", onChange: (e) => set("vin", e.target.value.toUpperCase()) }), { hint: "17 characters, found on your V5C. Helps verification; never shown publicly." })}
    </>
  );
}

function FeaturePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [custom, setCustom] = useState("");
  const toggle = (f: string) => onChange(value.includes(f) ? value.filter((x) => x !== f) : [...value, f]);
  const extras = useMemo(() => value.filter((v) => !COMMON_FEATURES.includes(v)), [value]);
  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-medium text-charcoal">Equipment &amp; features</legend>
      <p className="mb-3 text-[12.5px] text-muted">Select only features your vehicle actually has. These appear on your listing as seller-stated.</p>
      <div className="flex flex-wrap gap-1.5">
        {[...COMMON_FEATURES, ...extras].map((f) => (
          <button type="button" key={f} onClick={() => toggle(f)} aria-pressed={value.includes(f)}
            className={cn("rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-[12.5px]", value.includes(f) ? "border-ink bg-ink text-white" : "border-line bg-white text-slate hover:border-silver")}>
            {f}{extras.includes(f) ? <X className="ml-1 inline size-3" /> : null}
          </button>
        ))}
      </div>
      <div className="mt-3 flex max-w-sm gap-2">
        <Input aria-label="Add another feature" placeholder="Add another feature" value={custom} maxLength={60} onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (custom.trim()) { onChange([...new Set([...value, custom.trim()])]); setCustom(""); } } }} />
        <Button type="button" variant="secondary" onClick={() => { if (custom.trim()) { onChange([...new Set([...value, custom.trim()])]); setCustom(""); } }}><Plus /></Button>
      </div>
    </fieldset>
  );
}

function Review({ vehicle: v, terms, images, onSubmitted, goto }: { vehicle: Vehicle; terms: SaleTerms | null; images: number; onSubmitted: () => void; goto: (s: Step) => void }) {
  const [declared, setDeclared] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const section = (title: string, s: Step, items: { label: string; value: React.ReactNode }[]) => (
    <div className="rounded-[var(--radius-sm)] border border-line p-4">
      <div className="mb-2 flex items-center justify-between"><p className="font-medium text-ink">{title}</p><Button size="sm" variant="link" onClick={() => goto(s)}>Edit</Button></div>
      <DefinitionList items={items} />
    </div>
  );
  if (done) return <div className="py-10 text-center"><CheckCircle2 className="mx-auto size-10 text-success" strokeWidth={1.25} /><p className="mt-4 text-lg font-semibold">Submitted</p><p className="mt-1 text-muted">Taking you to your vehicle…</p></div>;
  return (
    <div className="space-y-4">
      {section("Vehicle", 1, [{ label: "Registration", value: v.registration_number }, { label: "Vehicle", value: [v.year, v.make, v.model].join(" ") }, { label: "Derivative", value: v.derivative }, { label: "VIN", value: v.vin ? `•••••${v.vin.slice(-4)}` : null }])}
      {section("Specification", 2, [{ label: "Mileage", value: formatMileage(v.mileage) }, { label: "Fuel", value: v.fuel_type ? FUEL_LABELS[v.fuel_type] : null }, { label: "Transmission", value: v.transmission ? TRANSMISSION_LABELS[v.transmission] : null }, { label: "Body", value: v.body_type ? BODY_LABELS[v.body_type] : null }, { label: "Features", value: v.specification.length || null }])}
      {section("Condition & disclosures", 3, [{ label: "Condition", value: v.condition ? CONDITION_LABELS[v.condition] : null }, { label: "Outstanding finance", value: v.has_outstanding_finance == null ? null : v.has_outstanding_finance ? "Yes" : "No" },
        { label: "Damage disclosed", value: v.cosmetic_damage ? "Yes" : "None" }, { label: "Mechanical issues", value: v.mechanical_issues ? "Yes" : "None" }])}
      {section("History", 4, [{ label: "Service history", value: SERVICE_HISTORY_LABELS[v.service_history] }, { label: "MOT expiry", value: v.mot_expiry }, { label: "Previous keepers", value: v.previous_keepers }])}
      {section("Photographs", 5, [{ label: "Photographs", value: images }])}
      {section("Selling details", 6, [{ label: "Location", value: [v.location, v.postcode].filter(Boolean).join(", ") }, { label: "Asking price", value: formatPrice(terms?.desired_asking_price) }, { label: "Minimum (private)", value: formatPrice(terms?.minimum_authorised_price) }])}
      <div className="rounded-[var(--radius-sm)] border border-ink/20 bg-paper p-4">
        <Checkbox checked={declared} onChange={(e) => setDeclared(e.target.checked)}
          label="Seller declaration"
          description="I am the registered keeper or am otherwise entitled to sell this vehicle. I am selling as a private individual, not in the course of a business. The information and photographs I have provided are accurate, and I will tell Meridian Motors promptly if anything changes. I understand that valuations are indicative and not guaranteed." />
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <Button variant="ghost" onClick={() => goto(7)}><ChevronLeft />Back</Button>
        <Button size="lg" disabled={!declared || pending} onClick={() => start(async () => { setError(null); const r = await submitVehicle(v.id, declared); if (!r.ok) setError(r.error); else { setDone(true); onSubmitted(); } })}>
          {pending ? <Loader2 className="animate-spin" /> : null}Submit vehicle
        </Button>
      </div>
      <p className="text-[12px] text-muted">After submission, Meridian reviews your vehicle. Nothing is published until you have approved your listing and asking price.</p>
    </div>
  );
}
