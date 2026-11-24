"use client";
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import * as A from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Checkbox, Field, Input, Label, Select, Textarea } from "@/components/ui/input";
import { STATUS_TRANSITIONS, VEHICLE_STATUS_META, BODY_LABELS, FUEL_LABELS, TRANSMISSION_LABELS, ROLE_LABELS } from "@/lib/constants";
import type { ActionResult } from "@/lib/action-result";
import type { AppRole, VehicleStatus } from "@/lib/types";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionResult<unknown> | null>(null);
  const run = (fn: () => Promise<ActionResult<unknown>>, after?: () => void) => start(async () => { const r = await fn(); setRes(r); if (r.ok) after?.(); router.refresh(); });
  const feedback = res ? <Alert tone={res.ok ? "success" : "danger"} className="mt-3">{res.ok ? res.message ?? "Done." : res.error}</Alert> : null;
  return { pending, run, feedback };
}

export function TransitionForm({ vehicleId, status }: { vehicleId: string; status: VehicleStatus }) {
  const { pending, run, feedback } = useRun();
  const options = STATUS_TRANSITIONS[status].filter((t) => t.to !== "receiving_enquiries" || status !== "published");
  const [to, setTo] = useState<VehicleStatus | "">(options[0]?.to ?? "");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  if (!options.length) return <p className="text-[13px] text-muted">No further pipeline transitions from {VEHICLE_STATUS_META[status].label}.</p>;
  return (
    <div className="space-y-3">
      <Field label="Move to" htmlFor="tr-to"><Select id="tr-to" value={to} onChange={(e) => setTo(e.target.value as VehicleStatus)}>
        {options.map((o) => <option key={o.to} value={o.to}>{VEHICLE_STATUS_META[o.to].label}{o.actor === "seller" ? " (normally seller)" : ""}</option>)}
      </Select></Field>
      <Field label="Reason (shared with seller)" htmlFor="tr-r"><Input id="tr-r" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></Field>
      <Field label="Internal notes (staff only)" htmlFor="tr-n"><Textarea id="tr-n" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <Button className="w-full" disabled={pending || !to} onClick={() => run(() => A.staffTransition(vehicleId, to as VehicleStatus, reason, notes))}>{pending ? <Loader2 className="animate-spin" /> : null}Update status</Button>
      {feedback}
    </div>
  );
}

export function ReviewForm({ vehicleId }: { vehicleId: string }) {
  const { pending, run, feedback } = useRun();
  const [msg, setMsg] = useState("");
  return (
    <div className="space-y-3">
      <Textarea aria-label="Message to seller" rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Required when rejecting or requesting information" />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={() => run(() => A.reviewListing(vehicleId, "approve", msg))}>Approve listing</Button>
        <Button size="sm" variant="secondary" disabled={pending || !msg.trim()} onClick={() => run(() => A.reviewListing(vehicleId, "request_information", msg))}>Request information</Button>
        <Button size="sm" variant="danger" disabled={pending || !msg.trim()} onClick={() => { if (confirm("Reject this listing?")) run(() => A.reviewListing(vehicleId, "reject", msg)); }}>Reject</Button>
      </div>
      {feedback}
    </div>
  );
}

export function SimpleAction({ label, action, variant = "secondary", confirmText, size = "sm" }: { label: string; action: () => Promise<ActionResult<unknown>>; variant?: "primary" | "secondary" | "ghost" | "danger"; confirmText?: string; size?: "sm" | "md" }) {
  const { pending, run, feedback } = useRun();
  return <div><Button size={size} variant={variant} disabled={pending} onClick={() => { if (!confirmText || confirm(confirmText)) run(action); }}>{pending ? <Loader2 className="animate-spin" /> : null}{label}</Button>{feedback}</div>;
}

export function NoteForm({ vehicleId }: { vehicleId: string }) {
  const { pending, run, feedback } = useRun();
  const [note, setNote] = useState("");
  return <div className="space-y-2"><Textarea aria-label="Internal note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Private note — never shown to the seller" />
    <Button size="sm" disabled={pending || !note.trim()} onClick={() => run(() => A.addInternalNote(vehicleId, note), () => setNote(""))}>Add note</Button>{feedback}</div>;
}

export function FlagForm({ vehicleId, flagged, reason }: { vehicleId: string; flagged: boolean; reason: string | null }) {
  const { pending, run, feedback } = useRun();
  const [r, setR] = useState(reason ?? "");
  if (flagged) return <div><p className="mb-2 text-[13px] text-danger">Flagged: {reason}</p><Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => A.flagVehicle(vehicleId, null))}>Remove flag</Button>{feedback}</div>;
  return <div className="flex gap-2"><Input aria-label="Flag reason" value={r} onChange={(e) => setR(e.target.value)} placeholder="Reason for flagging as suspicious" />
    <Button size="sm" variant="danger" disabled={pending || !r.trim()} onClick={() => run(() => A.flagVehicle(vehicleId, r))}>Flag</Button>{feedback}</div>;
}

const VERIFICATIONS = { identity: "Seller identity", registration_match: "Registration matches documents", mileage_photo: "Mileage photo", v5c_document: "V5C document", service_history: "Service history", photos: "Photographs", disclosures: "Disclosures" };
export function VerificationForm({ vehicleId }: { vehicleId: string }) {
  const { pending, run, feedback } = useRun();
  const [type, setType] = useState("v5c_document");
  const [status, setStatus] = useState<"verified" | "rejected" | "pending">("verified");
  const [summary, setSummary] = useState("");
  const [notes, setNotes] = useState("");
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Select aria-label="Verification type" value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(VERIFICATIONS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        <Select aria-label="Result" value={status} onChange={(e) => setStatus(e.target.value as "verified")}><option value="verified">Verified</option><option value="rejected">Failed</option><option value="pending">Pending</option></Select>
      </div>
      <Input aria-label="Public summary" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Public summary, e.g. 'V5C sighted; keeper name matches seller'" />
      <Textarea aria-label="Internal notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes" />
      <Button size="sm" disabled={pending} onClick={() => run(() => A.recordVerification(vehicleId, type, status, summary, notes))}>Record verification</Button>
      <p className="text-[11.5px] text-muted">Only record &ldquo;Verified&rdquo; after actually completing the check. Verified items appear on the public listing with today&apos;s date.</p>
      {feedback}
    </div>
  );
}

export function ProposePriceForm({ vehicleId, min }: { vehicleId: string; min: number | null }) {
  const { pending, run, feedback } = useRun();
  const [price, setPrice] = useState("");
  const [why, setWhy] = useState("");
  return (
    <div className="space-y-2">
      <div className="flex gap-2"><Input aria-label="Proposed price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))} placeholder="£" />
        <Button size="sm" disabled={pending || !price} onClick={() => run(() => A.proposePrice(vehicleId, Number(price), why))}>Send to seller</Button></div>
      <Input aria-label="Explanation" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Explanation for the seller" />
      <p className="text-[11.5px] text-muted">Seller&apos;s authorised minimum: {min ? `£${min.toLocaleString("en-GB")}` : "not set"}. Prices only change after the seller accepts.</p>
      {feedback}
    </div>
  );
}

export function ListingEditForm({ vehicleId, title, description, highlights }: { vehicleId: string; title: string; description: string; highlights: string[] }) {
  const { pending, run, feedback } = useRun();
  const [t, setT] = useState(title); const [d, setD] = useState(description); const [h, setH] = useState(highlights.join("\n"));
  return (
    <div className="space-y-3">
      <Field label="Title" htmlFor="le-t"><Input id="le-t" value={t} onChange={(e) => setT(e.target.value)} maxLength={140} /></Field>
      <Field label="Highlights (one per line)" htmlFor="le-h"><Textarea id="le-h" rows={3} value={h} onChange={(e) => setH(e.target.value)} /></Field>
      <Field label="Description" htmlFor="le-d"><Textarea id="le-d" rows={8} value={d} onChange={(e) => setD(e.target.value)} maxLength={6000} /></Field>
      <Button size="sm" disabled={pending} onClick={() => run(() => A.staffEditListing(vehicleId, t, d, h))}>Save listing copy</Button>
      <p className="text-[11.5px] text-muted">Saving resets the seller&apos;s approval — they must re-approve before publication.</p>
      {feedback}
    </div>
  );
}

export function CoreEditForm({ vehicleId, v }: { vehicleId: string; v: Record<string, unknown> }) {
  const { pending, run, feedback } = useRun();
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(["make", "model", "derivative", "year", "mileage", "colour", "registration_number", "mot_expiry", "mot_source"].map((k) => [k, v[k] == null ? "" : String(v[k])])));
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setVals((p) => ({ ...p, [k]: e.target.value }));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {["make", "model", "derivative", "year", "mileage", "colour", "registration_number"].map((k) => <div key={k}><Label htmlFor={`ce-${k}`}>{k.replace("_", " ")}</Label><Input id={`ce-${k}`} value={vals[k]} onChange={set(k)} /></div>)}
        <div><Label htmlFor="ce-mot">MOT expiry</Label><Input id="ce-mot" type="date" value={vals.mot_expiry} onChange={set("mot_expiry")} /></div>
        <div className="col-span-2"><Label htmlFor="ce-ms">MOT source</Label><Select id="ce-ms" value={vals.mot_source} onChange={set("mot_source")}><option value="">None</option><option value="seller">Seller stated</option><option value="dvla">DVLA (verified)</option><option value="mot_history_api">MOT history API (verified)</option></Select></div>
      </div>
      <Button size="sm" disabled={pending} onClick={() => run(() => A.staffUpdateVehicle(vehicleId, vals))}>Save vehicle details</Button>
      {feedback}
    </div>
  );
}

export function ManualVehicleForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(A.createManualVehicle, null);
  const fe = state && !state.ok ? state.fieldErrors ?? {} : {};
  const opts = (o: Record<string, string>) => Object.entries(o).map(([v, l]) => <option key={v} value={v}>{l}</option>);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="Make" htmlFor="m-make" error={fe.make} required><Input id="m-make" name="make" /></Field>
      <Field label="Model" htmlFor="m-model" error={fe.model} required><Input id="m-model" name="model" /></Field>
      <Field label="Derivative" htmlFor="m-der"><Input id="m-der" name="derivative" /></Field>
      <Field label="Registration" htmlFor="m-reg"><Input id="m-reg" name="registration_number" /></Field>
      <Field label="Year" htmlFor="m-year" error={fe.year} required><Input id="m-year" name="year" inputMode="numeric" /></Field>
      <Field label="Mileage" htmlFor="m-mil" error={fe.mileage} required><Input id="m-mil" name="mileage" inputMode="numeric" /></Field>
      <Field label="Fuel" htmlFor="m-fuel" error={fe.fuel_type} required><Select id="m-fuel" name="fuel_type">{opts(FUEL_LABELS)}</Select></Field>
      <Field label="Transmission" htmlFor="m-tr" required><Select id="m-tr" name="transmission">{opts(TRANSMISSION_LABELS)}</Select></Field>
      <Field label="Body" htmlFor="m-body" required><Select id="m-body" name="body_type">{opts(BODY_LABELS)}</Select></Field>
      <Field label="Colour" htmlFor="m-col"><Input id="m-col" name="colour" /></Field>
      <Field label="Town" htmlFor="m-loc" error={fe.location} required><Input id="m-loc" name="location" /></Field>
      <Field label="Postcode" htmlFor="m-pc" error={fe.postcode} required><Input id="m-pc" name="postcode" /></Field>
      <Field label="Seller account email (optional)" htmlFor="m-se" error={fe.seller_email} className="sm:col-span-2" hint="Links the vehicle to an existing customer account so they can manage and approve it."><Input id="m-se" name="seller_email" type="email" /></Field>
      {state && !state.ok ? <Alert tone="danger" className="sm:col-span-2">{state.error}</Alert> : null}
      <div className="sm:col-span-2"><Button type="submit" disabled={pending}>Create vehicle</Button></div>
    </form>
  );
}

export function RoleSelect({ profileId, role, canGrantAdmin }: { profileId: string; role: AppRole; canGrantAdmin: boolean }) {
  const { pending, run, feedback } = useRun();
  const roles: AppRole[] = canGrantAdmin ? ["customer", "verification_operator", "sales_operator", "admin", "super_admin"] : ["customer", "verification_operator", "sales_operator"];
  const locked = !canGrantAdmin && (role === "admin" || role === "super_admin");
  return <div><Select aria-label="Role" className="h-8 w-48 text-[13px]" defaultValue={role} disabled={pending || locked}
    onChange={(e) => { if (confirm(`Change role to ${ROLE_LABELS[e.target.value]}?`)) run(() => A.changeRole(profileId, e.target.value as AppRole)); else e.target.value = role; }}>
    {(locked ? [role] : roles).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select>{feedback}</div>;
}

export function EnquiryControls({ enquiryId, status, assignedTo, priority, staffList }: { enquiryId: string; status: string; assignedTo: string | null; priority: string; staffList: { id: string; name: string }[] }) {
  const { pending, run, feedback } = useRun();
  const statuses = ["new", "assigned", "in_progress", "awaiting_buyer", "awaiting_seller", "viewing_arranged", "offer_made", "closed_won", "closed_lost", "spam"];
  return (
    <div className="space-y-3">
      <div><Label htmlFor="eq-s">Status</Label><Select id="eq-s" defaultValue={status} disabled={pending} onChange={(e) => run(() => A.updateEnquiry(enquiryId, { enquiry_status: e.target.value }))}>{statuses.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</Select></div>
      <div><Label htmlFor="eq-a">Assigned to</Label><Select id="eq-a" defaultValue={assignedTo ?? ""} disabled={pending} onChange={(e) => run(() => A.updateEnquiry(enquiryId, { assigned_to: e.target.value || null, ...(e.target.value && status === "new" ? { enquiry_status: "assigned" } : {}) }))}>
        <option value="">Unassigned</option>{staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>
      <div><Label htmlFor="eq-p">Priority</Label><Select id="eq-p" defaultValue={priority} disabled={pending} onChange={(e) => run(() => A.updateEnquiry(enquiryId, { priority: e.target.value }))}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></Select></div>
      {feedback}
    </div>
  );
}

export function ActivityForm({ enquiryId }: { enquiryId: string }) {
  const { pending, run, feedback } = useRun();
  const [type, setType] = useState<"call_note" | "email_note" | "follow_up" | "reminder">("call_note");
  const [note, setNote] = useState(""); const [due, setDue] = useState("");
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Select aria-label="Activity type" value={type} onChange={(e) => setType(e.target.value as "call_note")}><option value="call_note">Call note</option><option value="email_note">Email note</option><option value="follow_up">Follow-up</option><option value="reminder">Reminder</option></Select>
        <Input aria-label="Due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
      </div>
      <Textarea aria-label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened / what needs doing" />
      <Button size="sm" disabled={pending || !note.trim()} onClick={() => run(() => A.addEnquiryActivity(enquiryId, type, note, due ? new Date(due).toISOString() : null), () => { setNote(""); setDue(""); })}>Add activity</Button>
      {feedback}
    </div>
  );
}

export function ViewingForm({ enquiryId }: { enquiryId: string }) {
  const { pending, run, feedback } = useRun();
  const [when, setWhen] = useState(""); const [note, setNote] = useState("");
  return <div className="space-y-2"><Input aria-label="Viewing date and time" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
    <Input aria-label="Viewing note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Location / instructions" />
    <Button size="sm" disabled={pending || !when} onClick={() => run(() => A.scheduleViewing(enquiryId, when, note))}>Schedule viewing</Button>{feedback}</div>;
}

export function RecordSaleForm({ vehicleId }: { vehicleId: string }) {
  const { pending, run, feedback } = useRun();
  const [price, setPrice] = useState("");
  return <div><div className="flex gap-2"><Input aria-label="Agreed price" inputMode="numeric" placeholder="Agreed price £" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))} />
    <Button size="sm" disabled={pending || !price} onClick={() => run(() => A.staffRecordSale(vehicleId, Number(price)))}>Record agreed sale</Button></div>{feedback}</div>;
}

export function SettingEditor({ settingKey, value, description }: { settingKey: string; value: unknown; description: string | null }) {
  const { pending, run, feedback } = useRun();
  const [raw, setRaw] = useState(JSON.stringify(value, null, 2));
  return (
    <div className="rounded-[var(--radius-sm)] border border-line p-4">
      <p className="font-mono text-[13px] font-semibold text-ink">{settingKey}</p>
      {description ? <p className="mt-0.5 text-[12.5px] text-muted">{description}</p> : null}
      <Textarea aria-label={settingKey} className="mt-3 font-mono text-[12.5px]" rows={Math.min(12, raw.split("\n").length + 1)} value={raw} onChange={(e) => setRaw(e.target.value)} />
      <Button size="sm" className="mt-2" disabled={pending} onClick={() => run(() => A.updateSetting(settingKey, raw))}>Save</Button>
      {feedback}
    </div>
  );
}

export function ServiceForm({ service }: { service?: { id: string; code: string; name: string; description: string; price: number; is_active: boolean } }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(A.upsertService, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1.4fr_2fr_100px_auto_auto] sm:items-end">
      {service ? <input type="hidden" name="id" value={service.id} /> : null}
      <Input aria-label="Code" name="code" defaultValue={service?.code} placeholder="code" readOnly={!!service} />
      <Input aria-label="Name" name="name" defaultValue={service?.name} placeholder="Name" />
      <Input aria-label="Description" name="description" defaultValue={service?.description} placeholder="Description" />
      <Input aria-label="Price" name="price" defaultValue={service?.price} inputMode="numeric" placeholder="£" />
      <Checkbox name="is_active" defaultChecked={service?.is_active ?? true} label="Active" />
      <Button size="sm" type="submit" disabled={pending}>{service ? "Save" : "Add"}</Button>
      {state ? <p className={`text-[12px] sm:col-span-6 ${state.ok ? "text-success" : "text-danger"}`}>{state.ok ? state.message : state.error}</p> : null}
    </form>
  );
}

export function ServiceOrderControls({ orderId, status, notes }: { orderId: string; status: string; notes: string | null }) {
  const { pending, run, feedback } = useRun();
  const [s, setS] = useState(status); const [n, setN] = useState(notes ?? ""); const [pay, setPay] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Select aria-label="Status" className="h-8 text-[13px]" value={s} onChange={(e) => setS(e.target.value)}>{["requested", "quoted", "awaiting_payment", "in_progress", "completed", "cancelled"].map((x) => <option key={x} value={x}>{x.replace("_", " ")}</option>)}</Select>
        <Button size="sm" disabled={pending} onClick={() => run(() => A.updateServiceOrder(orderId, s, n, pay))}>Save</Button>
      </div>
      <Input aria-label="Staff notes" className="h-8 text-[13px]" value={n} onChange={(e) => setN(e.target.value)} placeholder="Staff notes" />
      <Checkbox checked={pay} onChange={(e) => setPay(e.target.checked)} label="Request payment from seller" />
      {feedback}
    </div>
  );
}

export function DataRequestControls({ id, status }: { id: string; status: string }) {
  const { pending, run, feedback } = useRun();
  const [n, setN] = useState("");
  return <div className="flex flex-col gap-2"><Input aria-label="Resolution notes" className="h-8 text-[13px]" value={n} onChange={(e) => setN(e.target.value)} placeholder="Resolution notes" />
    <Select aria-label="Status" className="h-8 text-[13px]" defaultValue={status} disabled={pending} onChange={(e) => run(() => A.updateDataRequest(id, e.target.value, n))}>
      {["received", "verifying", "in_progress", "completed", "refused"].map((x) => <option key={x} value={x}>{x.replace("_", " ")}</option>)}</Select>{feedback}</div>;
}

export function AssistanceReply({ id }: { id: string }) {
  const { pending, run, feedback } = useRun();
  const [r, setR] = useState("");
  return <div className="flex flex-col gap-2"><Textarea aria-label="Reply" rows={2} value={r} onChange={(e) => setR(e.target.value)} placeholder="Reply to seller (sent as a notification)" />
    <div className="flex gap-2"><Button size="sm" disabled={pending} onClick={() => run(() => A.respondAssistance(id, r, "in_progress"))}>Reply</Button><Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => A.respondAssistance(id, r, "resolved"))}>Resolve</Button></div>{feedback}</div>;
}
