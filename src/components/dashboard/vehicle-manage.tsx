"use client";
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, HandHelping, Lightbulb, Loader2, Sparkles, Trash2, X, Handshake, LogOut } from "lucide-react";
import {
  sellerApproveListing, updateListingCopy, generateListingDraft, decideListingDraft, withdrawVehicle, reportSale, requestAssistance, listingInsights, deleteDraft,
} from "@/app/actions/seller";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { formatPrice } from "@/lib/format";
import type { ActionResult } from "@/lib/action-result";

type Draft = { id: string; source: string; title: string; short_description: string | null; description: string; highlights: string[]; created_at: string };

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const run = (fn: () => Promise<ActionResult<unknown>>, after?: () => void) => start(async () => {
    setError(null); setMessage(null);
    const r = await fn();
    if (!r.ok) setError(r.error); else { if (r.message) setMessage(r.message); after?.(); }
    router.refresh();
  });
  return { pending, error, message, run };
}

export function ListingEditor({ vehicleId, title, description, canEdit, canApprove, sellerApproved, drafts, aiConfigured, hasListing }: {
  vehicleId: string; title: string; description: string; canEdit: boolean; canApprove: boolean; sellerApproved: boolean; drafts: Draft[]; aiConfigured: boolean; hasListing: boolean;
}) {
  const { pending, error, message, run } = useRun();
  const [t, setT] = useState(title);
  const [d, setD] = useState(description);
  const [editing, setEditing] = useState(false);
  if (!hasListing) return <p className="text-[13.5px] text-muted">Your listing is created when you submit your vehicle.</p>;
  return (
    <div className="space-y-5">
      {drafts.map((dr) => (
        <div key={dr.id} className="rounded-[var(--radius-md)] border border-accent/40 bg-accent-soft/30 p-5">
          <div className="flex flex-wrap items-center gap-2"><Badge tone="accent"><Sparkles />{dr.source === "ai" ? "AI-generated draft" : "Draft from Meridian"}</Badge><span className="text-[12px] text-muted">Awaiting your approval</span></div>
          <p className="mt-3 font-semibold text-ink">{dr.title}</p>
          {dr.highlights.length ? <ul className="mt-2 list-disc pl-5 text-[13px] text-slate">{dr.highlights.map((h) => <li key={h}>{h}</li>)}</ul> : null}
          <p className="mt-3 whitespace-pre-line text-[13.5px] leading-relaxed text-slate">{dr.description}</p>
          <p className="mt-3 text-[12px] text-muted">Please check every statement is accurate before approving. Approved text replaces your current listing copy.</p>
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={() => run(() => decideListingDraft(dr.id, true))} disabled={pending}><Check />Approve this text</Button>
            <Button size="sm" variant="secondary" onClick={() => run(() => decideListingDraft(dr.id, false))} disabled={pending}><X />Reject</Button>
          </div>
        </div>
      ))}
      {editing ? (
        <div className="space-y-4">
          <Field label="Listing title" htmlFor="lt"><Input id="lt" value={t} onChange={(e) => setT(e.target.value)} maxLength={140} /></Field>
          <Field label="Description" htmlFor="ld"><Textarea id="ld" rows={8} value={d} onChange={(e) => setD(e.target.value)} maxLength={6000} /></Field>
          <div className="flex gap-2"><Button onClick={() => run(() => updateListingCopy(vehicleId, t, d), () => setEditing(false))} disabled={pending}>Save text</Button><Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></div>
        </div>
      ) : (
        <div>
          <p className="font-semibold text-ink">{title || <span className="text-muted">No title yet</span>}</p>
          <p className="mt-2 line-clamp-6 whitespace-pre-line text-[13.5px] leading-relaxed text-slate">{description || <span className="text-muted">No description yet.</span>}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        {canEdit && !editing ? <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>Edit text</Button> : null}
        {canEdit ? (
          aiConfigured
            ? <Button variant="secondary" size="sm" onClick={() => run(() => generateListingDraft(vehicleId))} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Sparkles />}Generate a professional description</Button>
            : <Button variant="secondary" size="sm" disabled title="AI listing generation is not configured">AI description unavailable</Button>
        ) : null}
        {canApprove ? (
          sellerApproved ? <Badge tone="success" className="py-1.5"><Check />You approved this listing</Badge>
            : <Button size="sm" onClick={() => run(() => sellerApproveListing(vehicleId))} disabled={pending}><Check />Approve listing &amp; price</Button>
        ) : null}
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}
    </div>
  );
}

export function VehicleActions({ vehicleId, status, askingPrice, canReportSale, canWithdraw, isDraft }: {
  vehicleId: string; status: string; askingPrice: number | null; canReportSale: boolean; canWithdraw: boolean; isDraft: boolean;
}) {
  const router = useRouter();
  const { pending, error, message, run } = useRun();
  const [price, setPrice] = useState(askingPrice?.toString() ?? "");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [assist, assistAction, assistPending] = useActionState<ActionResult | null, FormData>(requestAssistance, null);
  return (
    <div className="flex flex-wrap gap-2">
      {canReportSale ? (
        <Dialog>
          <DialogTrigger asChild><Button size="sm"><Handshake />Report a sale</Button></DialogTrigger>
          <DialogContent title="Report a sale" description="Tell us the agreed price. Meridian will confirm the handover with you before the sale is marked complete.">
            <div className="space-y-4">
              <Field label="Agreed sale price (£)" htmlFor="sp"><Input id="sp" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))} /></Field>
              <Field label="Notes (optional)" htmlFor="sn"><Textarea id="sn" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Buyer collecting on Saturday" /></Field>
              <Button className="w-full" disabled={pending || !price} onClick={() => run(() => reportSale(vehicleId, Number(price), notes))}>Report sale</Button>
              {message ? <Alert tone="success">{message}</Alert> : null}{error ? <Alert tone="danger">{error}</Alert> : null}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
      <Dialog>
        <DialogTrigger asChild><Button size="sm" variant="secondary"><HandHelping />Request assistance</Button></DialogTrigger>
        <DialogContent title="Request assistance" description="A member of the Meridian team will get back to you.">
          {assist?.ok ? <Alert tone="success">{assist.message}</Alert> : (
            <form action={assistAction} className="space-y-4">
              <input type="hidden" name="vehicleId" value={vehicleId} />
              <Field label="What do you need help with?" htmlFor="topic">
                <Select id="topic" name="topic" defaultValue="listing_change">
                  <option value="listing_change">Change my vehicle details or listing</option><option value="pricing">Pricing advice</option><option value="photos">Photographs</option>
                  <option value="enquiries">Managing enquiries</option><option value="viewing">Arranging a viewing</option><option value="sale">Completing a sale</option><option value="other">Something else</option>
                </Select>
              </Field>
              <Field label="Message" htmlFor="am"><Textarea id="am" name="message" rows={4} maxLength={2000} /></Field>
              {assist && !assist.ok ? <Alert tone="danger">{assist.error}</Alert> : null}
              <Button type="submit" className="w-full" disabled={assistPending}>Send request</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      {canWithdraw ? (
        <Dialog>
          <DialogTrigger asChild><Button size="sm" variant="ghost" className="text-danger"><LogOut />Withdraw</Button></DialogTrigger>
          <DialogContent title="Withdraw this vehicle" description="Your listing will be removed from the marketplace. You can resubmit later.">
            <div className="space-y-4">
              <Field label="Reason (optional)" htmlFor="wr"><Textarea id="wr" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Sold elsewhere, decided to keep it" /></Field>
              <Button variant="danger" className="w-full" disabled={pending} onClick={() => run(() => withdrawVehicle(vehicleId, reason))}>Withdraw vehicle</Button>
              {error ? <Alert tone="danger">{error}</Alert> : null}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
      {isDraft ? <Button size="sm" variant="ghost" className="text-danger" disabled={pending} onClick={() => { if (confirm("Delete this draft permanently?")) run(() => deleteDraft(vehicleId), () => router.push("/dashboard/vehicles")); }}><Trash2 />Delete draft</Button> : null}
      {status === "withdrawn" ? <Button size="sm" variant="secondary" onClick={() => router.push(`/dashboard/vehicles/${vehicleId}/submit?step=8`)}>Resubmit</Button> : null}
    </div>
  );
}

export function InsightsPanel({ vehicleId }: { vehicleId: string }) {
  const [pending, start] = useTransition();
  const [data, setData] = useState<{ reasons: string[]; suggestedPrice: number | null; ai?: { summary: string; suggestions: { type: string; suggestion: string; evidence: string }[] } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { setError(null); const r = await listingInsights(vehicleId); if (r.ok && r.data) setData(r.data); else if (!r.ok) setError(r.error); })}>
        {pending ? <Loader2 className="animate-spin" /> : <Lightbulb />}Get listing insights
      </Button>
      {error ? <p className="mt-2 text-[13px] text-muted">{error}</p> : null}
      {data ? (
        <div className="mt-4 space-y-3 text-[13.5px]">
          {data.reasons.length ? <ul className="list-disc space-y-1 pl-5 text-slate">{data.reasons.map((r) => <li key={r}>{r}</li>)}</ul> : <p className="text-slate">Your listing is performing within normal expectations.</p>}
          {data.suggestedPrice ? <Alert tone="info">You may want to consider a price review to {formatPrice(data.suggestedPrice)}. This is only a suggestion — nothing changes unless you update your price.</Alert> : null}
          {data.ai ? (
            <div className="rounded-[var(--radius-sm)] border border-line p-4">
              <p className="flex items-center gap-1.5 font-medium text-ink"><Sparkles className="size-3.5 text-accent" />AI suggestions</p>
              <p className="mt-1 text-slate">{data.ai.summary}</p>
              <ul className="mt-2 space-y-2">{data.ai.suggestions.map((s, i) => <li key={i}><span className="font-medium text-ink">{s.suggestion}</span><span className="block text-[12px] text-muted">{s.evidence}</span></li>)}</ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
