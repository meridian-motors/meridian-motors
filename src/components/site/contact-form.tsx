"use client";
import { useActionState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { submitContact } from "@/app/actions/public";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/action-result";

const TOPICS = [["buying", "Buying a vehicle"], ["selling", "Selling a vehicle"], ["account", "My account"], ["complaint", "Complaint"], ["data_protection", "Data protection"], ["press", "Press & partnerships"], ["other", "Something else"]];

export function ContactForm({ defaultTopic }: { defaultTopic?: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(submitContact, null);
  const fe = state && !state.ok ? state.fieldErrors ?? {} : {};
  if (state?.ok) return <div className="py-10 text-center"><CheckCircle2 className="mx-auto size-9 text-success" strokeWidth={1.5} /><p className="mt-4 text-[15px] text-ink">{state.message}</p></div>;
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="fullName" error={fe.fullName} required><Input id="fullName" name="fullName" autoComplete="name" /></Field>
        <Field label="Email" htmlFor="email" error={fe.email} required><Input id="email" name="email" type="email" autoComplete="email" /></Field>
        <Field label="Phone (optional)" htmlFor="phone" error={fe.phone}><Input id="phone" name="phone" type="tel" autoComplete="tel" /></Field>
        <Field label="Topic" htmlFor="topic" error={fe.topic}>
          <Select id="topic" name="topic" defaultValue={TOPICS.some(([v]) => v === defaultTopic) ? defaultTopic : "buying"}>{TOPICS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        </Field>
      </div>
      <Field label="Message" htmlFor="message" error={fe.message} required><Textarea id="message" name="message" rows={6} maxLength={4000} /></Field>
      {state && !state.ok ? <Alert tone="danger">{state.error}</Alert> : null}
      <Button type="submit" size="lg" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null}Send message</Button>
      <p className="text-[12px] text-muted">We use your details only to respond to your message. See our privacy policy.</p>
    </form>
  );
}
