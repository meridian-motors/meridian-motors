import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, FileText } from "lucide-react";
import { requireStaff, displayName } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isAiConfigured } from "@/lib/ai/run";
import * as A from "@/app/actions/admin";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DefinitionList, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { VehicleStatusBadge, ListingStatusBadge, EnquiryStatusBadge } from "@/components/dashboard/status";
import { ImageManager } from "@/components/dashboard/uploaders";
import { DocumentList } from "@/components/admin/document-list";
import { ValuationPanel } from "@/components/dashboard/valuation-panel";
import { TransitionForm, ReviewForm, NoteForm, FlagForm, VerificationForm, ProposePriceForm, ListingEditForm, CoreEditForm, SimpleAction, RecordSaleForm } from "@/components/admin/controls";
import { CreateListingForm } from "@/components/admin/create-listing";
import { BODY_LABELS, CONDITION_LABELS, FUEL_LABELS, SERVICE_HISTORY_LABELS, TRANSMISSION_LABELS, VEHICLE_STATUS_META, DOCUMENT_TYPE_LABELS } from "@/lib/constants";
import { formatDate, formatDateTime, formatMileage, formatPrice, vehicleName } from "@/lib/format";
import type { Comparable, EnquiryStatus, Listing, PriceRecommendation, SaleTerms, Valuation, Vehicle, VehicleStatus, DocumentType } from "@/lib/types";

export const metadata = { title: "Vehicle" };

export default async function AdminVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireStaff();
  const supabase = await createClient();
  const { data: vehicle } = await supabase.from("vehicles").select("*, sellers(id, seller_type, verification_status, profiles(id, email, first_name, last_name, phone))").eq("id", id).maybeSingle();
  if (!vehicle) notFound();
  const v = vehicle as Vehicle & { sellers: { id: string; seller_type: string; verification_status: string; profiles: { id: string; email: string; first_name: string | null; last_name: string | null; phone: string | null } } | null };
  const [{ data: listing }, { data: terms }, { data: images }, { data: docs }, { data: valuation }, { data: recs }, { data: history }, { data: notes }, { data: checks }, { data: verifs }, { data: enquiries }, { data: tx }, { data: priceHistory }] = await Promise.all([
    supabase.from("listings").select("*").eq("vehicle_id", id).is("deleted_at", null).maybeSingle(),
    supabase.from("vehicle_sale_terms").select("*").eq("vehicle_id", id).maybeSingle(),
    supabase.from("vehicle_images").select("id, public_url, image_type, is_primary, display_order").eq("vehicle_id", id).order("display_order"),
    supabase.from("vehicle_documents").select("id, document_type, file_name, size_bytes, created_at, access_level").eq("vehicle_id", id),
    supabase.from("valuations").select("*").eq("vehicle_id", id).in("valuation_status", ["completed", "insufficient_data"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("price_recommendations").select("*").eq("vehicle_id", id).order("created_at", { ascending: false }),
    supabase.from("vehicle_status_history").select("*, profiles(first_name, last_name, email)").eq("vehicle_id", id).order("created_at", { ascending: false }),
    supabase.from("vehicle_internal_notes").select("*, profiles(first_name, last_name, email)").eq("vehicle_id", id).order("created_at", { ascending: false }),
    supabase.from("vehicle_checks").select("*").eq("vehicle_id", id).order("checked_at", { ascending: false }),
    supabase.from("vehicle_verifications").select("*").eq("vehicle_id", id),
    supabase.from("enquiries").select("id, buyer_display_name, enquiry_type, enquiry_status, created_at").eq("vehicle_id", id).order("created_at", { ascending: false }),
    supabase.from("transactions").select("*").eq("vehicle_id", id).order("created_at", { ascending: false }),
    supabase.from("price_history").select("*").eq("vehicle_id", id).order("created_at", { ascending: false }),
  ]);
  const l = listing as Listing | null;
  const t = terms as SaleTerms | null;
  const { data: comps } = valuation ? await supabase.from("comparable_vehicles").select("*").eq("valuation_id", valuation.id) : { data: [] };
  const { data: drafts } = l ? await supabase.from("listing_content_drafts").select("*").eq("listing_id", l.id).eq("draft_status", "pending") : { data: [] };
  const seller = v.sellers;
  const name = (p: unknown) => { const x = (Array.isArray(p) ? p[0] : p) as { first_name: string | null; last_name: string | null; email: string } | null; return x ? displayName(x) : "System"; };
  const managedStock = !v.owner_id && !v.dealership_id;
  const awaitingAdmin = l && l.seller_approved_at && !l.admin_approved_at;

  return (
    <>
      <PageHeader eyebrow="Inventory" title={vehicleName(v)}
        description={<span className="inline-flex flex-wrap items-center gap-2"><VehicleStatusBadge status={v.vehicle_status} />{l ? <ListingStatusBadge status={l.listing_status} /> : null}
          <span className="font-mono">{v.registration_number ?? "no reg"}</span>{v.is_flagged ? <Badge tone="danger">Flagged</Badge> : null}{l?.featured ? <Badge tone="dark">Featured</Badge> : null}</span>}
        actions={<>{l?.slug && l.listing_status === "published" ? <Button asChild variant="secondary"><Link href={`/cars/${l.slug}`} target="_blank"><ExternalLink />Public listing</Link></Button> : null}</>} />

      {awaitingAdmin ? <Alert tone="info" className="mb-6" title="Awaiting Meridian listing approval">The seller has approved this listing. Review the content, photographs, disclosures and valuation, then approve or reject.</Alert> : null}
      {v.vehicle_status === "approved_for_publication" && l?.admin_approved_at ? <Alert tone="success" className="mb-6" title="Ready to publish" action={<SimpleAction label="Publish now" variant="primary" action={A.publishVehicle.bind(null, id)} />}>Both the seller and Meridian have approved this listing.</Alert> : null}

      <div className="grid gap-8 xl:grid-cols-[1.5fr_1fr]">
        <div className="min-w-0 space-y-8">
          <Card>
            <CardHeader title="Vehicle details" />
            <CardBody>
              <DefinitionList items={[
                { label: "Make / model", value: `${v.make ?? "—"} ${v.model ?? ""}` }, { label: "Derivative", value: v.derivative }, { label: "Year", value: v.year },
                { label: "Mileage", value: formatMileage(v.mileage) }, { label: "Fuel", value: v.fuel_type ? FUEL_LABELS[v.fuel_type] : null },
                { label: "Transmission", value: v.transmission ? TRANSMISSION_LABELS[v.transmission] : null }, { label: "Body", value: v.body_type ? BODY_LABELS[v.body_type] : null },
                { label: "Engine", value: v.engine_size ? `${v.engine_size}cc` : null }, { label: "Colour", value: v.colour }, { label: "Doors / seats", value: `${v.doors ?? "—"} / ${v.seats ?? "—"}` },
                { label: "VIN", value: v.vin }, { label: "Condition", value: v.condition ? CONDITION_LABELS[v.condition] : null },
                { label: "Service history", value: SERVICE_HISTORY_LABELS[v.service_history] }, { label: "MOT expiry", value: v.mot_expiry ? `${formatDate(v.mot_expiry)} (${v.mot_source ?? "seller"})` : null },
                { label: "Previous keepers", value: v.previous_keepers }, { label: "Location", value: [v.location, v.postcode].filter(Boolean).join(", ") },
                { label: "Source", value: v.source.replace("_", " ") }, { label: "Submitted", value: v.submitted_at ? formatDateTime(v.submitted_at) : null },
              ]} />
              {v.specification.length ? <p className="mt-4 text-[13px] text-slate"><strong className="text-ink">Features:</strong> {v.specification.join(", ")}</p> : null}
              <div className="mt-5 grid gap-3 text-[13px] sm:grid-cols-2">
                {[["Cosmetic damage", v.cosmetic_damage], ["Mechanical issues", v.mechanical_issues], ["Accident history", v.accident_history], ["Modifications", v.modifications], ["Other", v.other_disclosures],
                  ["Outstanding finance", v.has_outstanding_finance == null ? null : v.has_outstanding_finance ? "YES — declared" : "No"]].map(([k, val]) => (
                  <div key={k} className="rounded-[var(--radius-sm)] border border-line p-3"><p className="text-[11.5px] uppercase tracking-[0.1em] text-muted">{k}</p><p className="mt-1 whitespace-pre-line text-charcoal">{val || "None declared"}</p></div>
                ))}
              </div>
              <p className="mt-3 text-[12px] text-muted">Disclosures confirmed: {v.disclosures_confirmed_at ? formatDateTime(v.disclosures_confirmed_at) : "no"} · Seller declaration: {v.seller_declaration_at ? formatDateTime(v.seller_declaration_at) : "no"}</p>
              <details className="mt-4"><summary className="cursor-pointer text-[13px] font-medium">Edit core details</summary><div className="mt-3"><CoreEditForm vehicleId={id} v={v as unknown as Record<string, unknown>} /></div></details>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Listing" description={l ? `Seller approved: ${l.seller_approved_at ? formatDateTime(l.seller_approved_at) : "no"} · Meridian approved: ${l.admin_approved_at ? formatDateTime(l.admin_approved_at) : "no"} · Source: ${l.description_source}` : "No listing yet"}
              action={l ? <SimpleAction label={l.featured ? "Unfeature" : "Feature"} action={A.toggleFeatured.bind(null, id, !l.featured)} /> : null} />
            <CardBody className="space-y-6">
              {!l ? <CreateListingForm vehicleId={id} defaultPrice={t?.desired_asking_price ?? null} /> : (
                <>
                  <div className="flex flex-wrap items-center gap-4 text-[13.5px]"><span>Asking price <strong className="text-ink">{formatPrice(l.asking_price)}</strong></span><span>Desired {formatPrice(t?.desired_asking_price)}</span><span>Expected {formatPrice(t?.expected_selling_price)}</span><span>Minimum <strong>{formatPrice(t?.minimum_authorised_price)}</strong></span>
                    <span className="text-muted">{l.view_count} views · {l.save_count} saves · {l.enquiry_count} enquiries</span></div>
                  {(drafts ?? []).map((d) => (
                    <div key={d.id} className="rounded-[var(--radius-sm)] border border-accent/40 bg-accent-soft/30 p-4">
                      <Badge tone="accent">{d.source === "ai" ? "AI draft" : "Staff draft"} · pending</Badge>
                      <p className="mt-2 font-semibold">{d.title}</p><p className="mt-1 line-clamp-6 whitespace-pre-line text-[13px] text-slate">{d.description}</p>
                      <div className="mt-3 flex gap-2"><SimpleAction label="Apply draft" variant="primary" action={A.staffDecideDraft.bind(null, d.id, true, id)} /><SimpleAction label="Reject" action={A.staffDecideDraft.bind(null, d.id, false, id)} /></div>
                    </div>
                  ))}
                  <ListingEditForm vehicleId={id} title={l.title ?? ""} description={l.description ?? ""} highlights={l.highlights} />
                  <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                    {isAiConfigured() ? <SimpleAction label="Generate AI draft" action={A.staffGenerateDraft.bind(null, id)} /> : <Badge>AI not configured</Badge>}
                    {managedStock && !l.seller_approved_at ? <SimpleAction label="Record owner authorisation" action={A.staffConfirmStockApproval.bind(null, id)} confirmText="Confirm you hold the owner's written authorisation for this listing and price." /> : null}
                  </div>
                  <div className="border-t border-line pt-4"><p className="mb-2 text-[13px] font-medium">Listing review</p><ReviewForm vehicleId={id} /></div>
                </>
              )}
            </CardBody>
          </Card>

          <Card id="pricing"><CardHeader title="Valuation & pricing" action={<SimpleAction label="Run valuation" action={A.staffRunValuation.bind(null, id)} />} />
            <CardBody className="space-y-6">
              <ValuationPanel vehicleId={id} valuation={valuation as Valuation | null} comparables={(comps ?? []) as Comparable[]} recommendations={[]} askingPrice={l?.asking_price ?? null} minimumPrice={t?.minimum_authorised_price ?? null} canRequest={false} canEditPrice={false} />
              <div><p className="mb-2 text-[13px] font-medium">Suggest a price review to the seller</p><ProposePriceForm vehicleId={id} min={t?.minimum_authorised_price ?? null} /></div>
              {(recs ?? []).length ? <Table><THead><tr><TH>Recommendation</TH><TH>Price</TH><TH>Seller decision</TH><TH>Created</TH></tr></THead><TBody>{(recs as PriceRecommendation[]).map((r) => <TR key={r.id}><TD>{r.recommendation_type.replace("_", " ")}</TD><TD>{formatPrice(r.recommended_price)}</TD><TD>{r.approved_by_seller == null ? "Undecided" : r.approved_by_seller ? "Accepted" : "Declined"}</TD><TD>{formatDate(r.created_at)}</TD></TR>)}</TBody></Table> : null}
              {(priceHistory ?? []).length ? <div><p className="mb-2 text-[13px] font-medium">Price history</p><Table><TBody>{(priceHistory ?? []).map((p) => <TR key={p.id}><TD>{formatDateTime(p.created_at)}</TD><TD>{formatPrice(p.previous_price)} → <strong>{formatPrice(p.new_price)}</strong></TD><TD className="text-[12.5px] text-muted">{p.change_reason ?? "—"} {p.authorised_by_seller ? "· seller authorised" : ""}</TD></TR>)}</TBody></Table></div> : null}
            </CardBody>
          </Card>

          <Card><CardHeader title="Photographs" description="Check for registration plates, personal information and image quality." /><CardBody><ImageManager vehicleId={id} images={images ?? []} /></CardBody></Card>
          <Card><CardHeader title="Documents" description="Private. Every view is recorded in the audit log." /><CardBody>
            <DocumentList documents={(docs ?? []).map((d) => ({ ...d, label: DOCUMENT_TYPE_LABELS[d.document_type as DocumentType] }))} />
            {!(docs ?? []).length ? <p className="flex items-center gap-2 text-[13px] text-muted"><FileText className="size-4" />No documents uploaded.</p> : null}
          </CardBody></Card>

          <Card><CardHeader title="Checks & verifications" /><CardBody className="space-y-5">
            {(checks ?? []).length ? <Table><THead><tr><TH>Check</TH><TH>Provider</TH><TH>Result</TH><TH>Date</TH><TH>Public</TH></tr></THead><TBody>
              {(checks ?? []).map((c) => <TR key={c.id}><TD>{c.check_type.replace(/_/g, " ")}<span className="block text-[12px] text-muted">{c.summary}</span></TD><TD>{c.provider}</TD><TD><Badge tone={c.result === "pass" ? "success" : "warning"}>{c.result}</Badge></TD><TD>{formatDate(c.checked_at)}</TD>
                <TD><SimpleAction label={c.is_public ? "Hide" : "Show on listing"} action={A.setCheckPublic.bind(null, c.id, !c.is_public)} /></TD></TR>)}
            </TBody></Table> : <p className="text-[13px] text-muted">No third-party checks recorded. Finance, stolen and write-off checks require a licensed provider integration.</p>}
            {(verifs ?? []).length ? <ul className="space-y-1 text-[13px]">{(verifs ?? []).map((x) => <li key={x.id}><Badge tone={x.status === "verified" ? "success" : x.status === "rejected" ? "danger" : "warning"}>{x.status}</Badge> {x.verification_type.replace(/_/g, " ")} {x.verified_at ? `· ${formatDate(x.verified_at)}` : ""} {x.public_summary ? `— ${x.public_summary}` : ""}</li>)}</ul> : null}
            <VerificationForm vehicleId={id} />
          </CardBody></Card>
        </div>

        <div className="space-y-8">
          <Card><CardHeader title="Seller" /><CardBody>
            {seller ? <DefinitionList className="!grid-cols-1" items={[
              { label: "Name", value: name(seller.profiles) }, { label: "Email", value: (Array.isArray(seller.profiles) ? seller.profiles[0] : seller.profiles)?.email },
              { label: "Phone", value: (Array.isArray(seller.profiles) ? seller.profiles[0] : seller.profiles)?.phone }, { label: "Type", value: seller.seller_type }, { label: "Verification", value: seller.verification_status },
              { label: "Preferred contact", value: t?.preferred_contact_method?.replace("_", " ") },
            ]} /> : <p className="text-[13px] text-muted">Meridian-managed stock (no seller account).</p>}
            {t?.seller_comments ? <p className="mt-3 rounded-[var(--radius-sm)] bg-paper p-3 text-[13px] text-slate">“{t.seller_comments}”</p> : null}
          </CardBody></Card>
          <Card><CardHeader title="Sales pipeline" description={`Current: ${VEHICLE_STATUS_META[v.vehicle_status].label}`} /><CardBody><TransitionForm vehicleId={id} status={v.vehicle_status as VehicleStatus} /></CardBody></Card>
          {["published", "receiving_enquiries", "viewing_arranged", "offer_received", "sale_agreed"].includes(v.vehicle_status) && !(tx ?? []).some((x) => !["fell_through", "cancelled"].includes(x.sale_status)) ? (
            <Card><CardHeader title="Record a sale" /><CardBody><RecordSaleForm vehicleId={id} /></CardBody></Card>) : null}
          {(tx ?? []).length ? <Card><CardHeader title="Transactions" /><CardBody className="space-y-3 text-[13px]">{(tx ?? []).map((x) => (
            <div key={x.id} className="rounded-[var(--radius-sm)] border border-line p-3"><p><strong>{formatPrice(x.agreed_price)}</strong> · {x.sale_status.replace("_", " ")}</p>
              <p className="text-muted">Seller confirmed: {x.seller_confirmed_at ? formatDateTime(x.seller_confirmed_at) : "no"}</p>
              {x.sale_status !== "completed" && !["fell_through", "cancelled"].includes(x.sale_status) ? <div className="mt-2 flex gap-2"><SimpleAction label="Confirm completed" variant="primary" action={A.completeSale.bind(null, x.id)} confirmText="Confirm the handover is complete? This raises the success fee." /><SimpleAction label="Fell through" action={A.markSaleFellThrough.bind(null, x.id)} /></div> : null}
            </div>))}</CardBody></Card> : null}
          <Card><CardHeader title="Risk" /><CardBody className="space-y-4"><FlagForm vehicleId={id} flagged={v.is_flagged} reason={v.flag_reason} />
            {isAiConfigured() ? <SimpleAction label="AI submission review" action={A.staffEnrich.bind(null, id)} /> : null}
            <SimpleAction label={v.archived_at ? "Restore from archive" : "Archive"} variant="ghost" action={A.archiveVehicle.bind(null, id, !v.archived_at)} confirmText={v.archived_at ? undefined : "Archive this vehicle? It will be hidden from the marketplace."} />
          </CardBody></Card>
          <Card><CardHeader title="Enquiries" /><CardBody>{(enquiries ?? []).length ? <ul className="space-y-2 text-[13px]">{(enquiries ?? []).map((e) => <li key={e.id} className="flex items-center justify-between gap-2"><Link className="hover:underline" href={`/admin/enquiries/${e.id}`}>{e.buyer_display_name ?? "Buyer"} · {e.enquiry_type.replace("_", " ")}</Link><EnquiryStatusBadge status={e.enquiry_status as EnquiryStatus} /></li>)}</ul> : <p className="text-[13px] text-muted">None.</p>}</CardBody></Card>
          <Card><CardHeader title="Internal notes" description="Staff only" /><CardBody className="space-y-4"><NoteForm vehicleId={id} />
            {(notes ?? []).map((n) => <div key={n.id} className="border-t border-line pt-3 text-[13px]"><p className="whitespace-pre-line text-charcoal">{n.note}</p><p className="mt-1 text-[11.5px] text-muted">{name(n.profiles)} · {formatDateTime(n.created_at)}</p></div>)}
          </CardBody></Card>
          <Card><CardHeader title="Status history" /><CardBody><ol className="space-y-3 text-[13px]">{(history ?? []).map((h) => (
            <li key={h.id} className="border-l-2 border-line pl-3"><p className="font-medium">{h.previous_status ? `${VEHICLE_STATUS_META[h.previous_status as VehicleStatus].label} → ` : ""}{VEHICLE_STATUS_META[h.new_status as VehicleStatus].label}</p>
              <p className="text-muted">{name(h.profiles)} · {formatDateTime(h.created_at)}</p>{h.reason ? <p className="text-slate">{h.reason}</p> : null}{h.internal_notes ? <p className="text-[12px] italic text-muted">Internal: {h.internal_notes}</p> : null}</li>))}</ol></CardBody></Card>
        </div>
      </div>
    </>
  );
}
