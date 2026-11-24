"use client";
import { useActionState, useState, useTransition } from "react";
import { updateProfile, updateNotificationPreferences, requestAccountDeletion } from "@/app/actions/account";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Checkbox, Field, Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";

type S = ActionResult | null;

export function ProfileForm({ profile }: { profile: { first_name: string | null; last_name: string | null; phone: string | null; email: string } }) {
  const [state, action, pending] = useActionState<S, FormData>(updateProfile, null);
  const fe = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="first_name" error={fe.first_name}><Input id="first_name" name="first_name" defaultValue={profile.first_name ?? ""} /></Field>
        <Field label="Last name" htmlFor="last_name" error={fe.last_name}><Input id="last_name" name="last_name" defaultValue={profile.last_name ?? ""} /></Field>
        <Field label="Phone" htmlFor="phone" error={fe.phone}><Input id="phone" name="phone" type="tel" defaultValue={profile.phone ?? ""} /></Field>
        <Field label="Email" htmlFor="email_ro" hint="Contact us to change your email address."><Input id="email_ro" value={profile.email} disabled readOnly /></Field>
      </div>
      {state ? <Alert tone={state.ok ? "success" : "danger"}>{state.ok ? state.message : state.error}</Alert> : null}
      <Button type="submit" disabled={pending}>Save profile</Button>
    </form>
  );
}

const PREF_LABELS: [string, string, string][] = [
  ["email_enquiries", "Enquiries and messages", "When buyers enquire or reply about your vehicles, or sellers reply to you."],
  ["email_listing_updates", "Listing updates", "Submission, approval, publication and sale updates."],
  ["email_valuations", "Valuations", "When a valuation is ready."],
  ["email_buyer_matches", "Recommended vehicles", "When a newly listed vehicle closely matches your preferences."],
  ["email_saved_search_alerts", "Saved search alerts", "When new vehicles match a saved search with alerts turned on."],
  ["email_marketing", "News and offers", "Occasional marketing emails from Meridian Motors."],
];

export function PreferencesForm({ prefs }: { prefs: Record<string, boolean> }) {
  const [state, action, pending] = useActionState<S, FormData>(updateNotificationPreferences, null);
  return (
    <form action={action} className="space-y-4">
      {PREF_LABELS.map(([k, l, d]) => <Checkbox key={k} name={k} defaultChecked={prefs[k]} label={l} description={d} />)}
      <p className="text-[12px] text-muted">Essential emails about your account, security and payments are always sent.</p>
      {state ? <Alert tone={state.ok ? "success" : "danger"}>{state.ok ? state.message : state.error}</Alert> : null}
      <Button type="submit" disabled={pending}>Save preferences</Button>
    </form>
  );
}

export function DeleteAccount({ pending: alreadyPending }: { pending: boolean }) {
  const [text, setText] = useState("");
  const [res, setRes] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  if (alreadyPending || res?.ok) return <Alert tone="info">{res?.ok ? res.message : "Your account deletion request is being processed."}</Alert>;
  return (
    <div className="space-y-3">
      <p className="text-[13.5px] text-slate">We will delete or anonymise your personal data within one month, except where the law requires us to keep records (for example completed sales and payment records for six years).</p>
      <div className="flex max-w-md gap-2"><Input aria-label='Type "DELETE" to confirm' placeholder='Type "DELETE"' value={text} onChange={(e) => setText(e.target.value)} />
        <Button variant="danger" disabled={pending} onClick={() => start(async () => setRes(await requestAccountDeletion(text)))}>Request deletion</Button></div>
      {res && !res.ok ? <p className="text-[13px] text-danger">{res.error}</p> : null}
    </div>
  );
}
