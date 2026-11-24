"use client";
import { useActionState } from "react";
import { saveBuyerPreferences } from "@/app/actions/buyer";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Checkbox, Field, Input } from "@/components/ui/input";
import { BODY_LABELS, FUEL_LABELS, TRANSMISSION_LABELS } from "@/lib/constants";
import type { ActionResult } from "@/lib/action-result";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function PreferencesEditor({ prefs, optIn }: { prefs: any; optIn: boolean }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveBuyerPreferences, null);
  const fe = state && !state.ok ? state.fieldErrors ?? {} : {};
  const p = prefs ?? {};
  const group = (name: string, labels: Record<string, string>, selected: string[] = []) => (
    <div className="flex flex-wrap gap-x-5 gap-y-2">{Object.entries(labels).filter(([v]) => v !== "other").map(([v, l]) => (
      <label key={v} className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name={name} value={v} defaultChecked={selected.includes(v)} className="accent-ink" />{l}</label>
    ))}</div>
  );
  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Preferred makes" htmlFor="preferred_makes" hint="Comma separated, e.g. Volkswagen, Skoda"><Input id="preferred_makes" name="preferred_makes" defaultValue={(p.preferred_makes ?? []).join(", ")} /></Field>
        <Field label="Preferred models" htmlFor="preferred_models" hint="Comma separated, e.g. Golf, Octavia"><Input id="preferred_models" name="preferred_models" defaultValue={(p.preferred_models ?? []).join(", ")} /></Field>
        <Field label="Minimum budget (£)" htmlFor="minimum_budget" error={fe.minimum_budget}><Input id="minimum_budget" name="minimum_budget" inputMode="numeric" defaultValue={p.minimum_budget ?? ""} /></Field>
        <Field label="Maximum budget (£)" htmlFor="maximum_budget" error={fe.maximum_budget}><Input id="maximum_budget" name="maximum_budget" inputMode="numeric" defaultValue={p.maximum_budget ?? ""} /></Field>
        <Field label="Maximum mileage" htmlFor="maximum_mileage"><Input id="maximum_mileage" name="maximum_mileage" inputMode="numeric" defaultValue={p.maximum_mileage ?? ""} /></Field>
        <Field label="Oldest year" htmlFor="minimum_year"><Input id="minimum_year" name="minimum_year" inputMode="numeric" defaultValue={p.minimum_year ?? ""} /></Field>
        <Field label="Your postcode or district" htmlFor="postcode" error={fe.postcode} hint="Used for distance only; stored at district level."><Input id="postcode" name="postcode" defaultValue={p.postcode ?? ""} /></Field>
        <Field label="Maximum distance (miles)" htmlFor="max_distance_miles"><Input id="max_distance_miles" name="max_distance_miles" inputMode="numeric" defaultValue={p.max_distance_miles ?? ""} /></Field>
      </div>
      <fieldset><legend className="mb-2 text-[13px] font-medium">Fuel</legend>{group("preferred_fuel", FUEL_LABELS, p.preferred_fuel)}</fieldset>
      <fieldset><legend className="mb-2 text-[13px] font-medium">Transmission</legend>{group("preferred_transmission", TRANSMISSION_LABELS, p.preferred_transmission)}</fieldset>
      <fieldset><legend className="mb-2 text-[13px] font-medium">Body type</legend>{group("preferred_body_type", BODY_LABELS, p.preferred_body_type)}</fieldset>
      <Field label="Must-have features" htmlFor="desired_features" hint="Comma separated, e.g. CarPlay, heated seats"><Input id="desired_features" name="desired_features" defaultValue={(p.desired_features ?? []).join(", ")} /></Field>
      <Checkbox name="matching_opt_in" defaultChecked={optIn} label="Email me when a newly listed vehicle closely matches my preferences" description="You can turn this off at any time. Matching uses only the preferences above." />
      {state ? <Alert tone={state.ok ? "success" : "danger"}>{state.ok ? state.message : state.error}</Alert> : null}
      <Button type="submit" disabled={pending}>Save preferences</Button>
    </form>
  );
}
