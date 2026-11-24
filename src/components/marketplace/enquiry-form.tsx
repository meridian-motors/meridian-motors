"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { submitEnquiry } from "@/app/actions/buyer";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { ENQUIRY_TYPE_LABELS } from "@/lib/constants";
import type { ActionResult } from "@/lib/action-result";

export function EnquiryForm({ listingId, vehicleName, defaults, isOwner }: {
  listingId: string; vehicleName: string; defaults: { fullName?: string; email?: string; phone?: string | null } | null; isOwner?: boolean;
}) {
  const [state, action, pending] = useActionState<ActionResult<{ enquiryId: string }> | null, FormData>(submitEnquiry, null);
  const [type, setType] = useState("viewing_request");
  const fe = state && !state.ok ? state.fieldErrors ?? {} : {};
  if (isOwner) return <p className="text-[13.5px] text-muted">This is your listing. Manage enquiries from your <Link className="underline" href="/dashboard/enquiries">dashboard</Link>.</p>;
  if (state?.ok) {
    return (
      <div className="py-4 text-center">
        <CheckCircle2 className="mx-auto size-8 text-success" strokeWidth={1.5} />
        <p className="mt-3 font-semibold text-ink">Enquiry sent</p>
        <p className="mt-1 text-[13.5px] text-muted">{state.message}</p>
        {defaults ? <Button asChild variant="secondary" size="sm" className="mt-4"><Link href="/dashboard/buying">View your enquiries</Link></Button> : null}
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="listingId" value={listingId} />
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <Field label="I would like to" htmlFor="enquiryType">
        <Select id="enquiryType" name="enquiryType" value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(ENQUIRY_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </Field>
      {type === "offer" ? (
        <Field label="Your offer (£)" htmlFor="offerAmount" error={fe.offerAmount} required>
          <Input id="offerAmount" name="offerAmount" type="number" inputMode="numeric" min={100} step={50} aria-invalid={!!fe.offerAmount} />
        </Field>
      ) : null}
      <Field label="Message" htmlFor="message" error={fe.message} required>
        <Textarea id="message" name="message" rows={4} maxLength={3000} aria-invalid={!!fe.message}
          defaultValue={`Hello, I'm interested in the ${vehicleName}. `} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="fullName" error={fe.fullName} required>
          <Input id="fullName" name="fullName" autoComplete="name" defaultValue={defaults?.fullName} aria-invalid={!!fe.fullName} />
        </Field>
        <Field label="Phone (optional)" htmlFor="phone" error={fe.phone}>
          <Input id="phone" name="phone" type="tel" autoComplete="tel" defaultValue={defaults?.phone ?? ""} aria-invalid={!!fe.phone} />
        </Field>
      </div>
      <Field label="Email" htmlFor="email" error={fe.email} required>
        <Input id="email" name="email" type="email" autoComplete="email" defaultValue={defaults?.email} aria-invalid={!!fe.email} />
      </Field>
      <div>
        <Checkbox name="consent" label={<>I agree that Meridian Motors may use my details to handle this enquiry, as described in the <Link href="/privacy" className="underline">privacy policy</Link>.</>} />
        {fe.consent ? <p className="mt-1.5 text-[12.5px] text-danger">{fe.consent}</p> : null}
      </div>
      {state && !state.ok ? <p role="alert" className="text-[13px] text-danger">{state.error}</p> : null}
      <Button type="submit" className="w-full" size="lg" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null} Send enquiry</Button>
      <p className="text-[12px] leading-relaxed text-muted">Your contact details are shared with Meridian Motors only. Sellers see your first name and message; we coordinate contact and viewings.</p>
    </form>
  );
}
