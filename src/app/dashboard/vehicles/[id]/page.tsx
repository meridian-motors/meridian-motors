import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Eye, Heart, MessageSquare } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isAiConfigured } from "@/lib/ai/run";
import { Card, CardBody, CardHeader, StatCard } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { VehicleStatusBadge, ListingStatusBadge, EnquiryStatusBadge } from "@/components/dashboard/status";
import { ValuationPanel } from "@/components/dashboard/valuation-panel";
import { ImageManager, DocumentManager } from "@/components/dashboard/uploaders";
import { ListingEditor, VehicleActions, InsightsPanel } from "@/components/dashboard/vehicle-manage";
import { PIPELINE_ORDER, VEHICLE_STATUS_META, ENQUIRY_TYPE_LABELS, SELLER_EDITABLE_STATUSES } from "@/lib/constants";
import { formatDateTime, formatPrice, timeAgo, vehicleName } from "@/lib/format";
import type { Comparable, EnquiryStatus, Listing, PriceRecommendation, SaleTerms, Valuation, Vehicle, VehicleStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "Manage vehicle" };

const MAIN_PATH: VehicleStatus[] = ["submitted", "verification_pending", "valuation_completed", "awaiting_seller_approval", "approved_for_publication", "published", "sale_agreed", "completed"];

export default async function ManageVehiclePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ submitted?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await requireUser(`/dashboard/vehicles/${id}`);
  const supabase = await createClient();
  const { data: vehicle } = await supabase.from("vehicles").select("*").eq("id", id).eq("owner_id", session.sellerId ?? "").is("deleted_at", null).maybeSingle();
  if (!vehicle) notFound();
  const v = vehicle as Vehicle;
  const [{ data: listing }, { data: terms }, { data: images }, { data: documents }, { data: valuation }, { data: recs }, { data: timeline }, { data: enquiries }, { data: tx }] = await Promise.all([
    supabase.from("listings").select("*").eq("vehicle_id", id).is("deleted_at", null).maybeSingle(),
    supabase.from("vehicle_sale_terms").select("*").eq("vehicle_id", id).maybeSingle(),
    supabase.from("vehicle_images").select("id, public_url, image_type, is_primary, display_order").eq("vehicle_id", id).order("display_order"),
    supabase.from("vehicle_documents").select("id, document_type, file_name, size_bytes, created_at").eq("vehicle_id", id).order("created_at", { ascending: false }),
    supabase.from("valuations").select("*").eq("vehicle_id", id).in("valuation_status", ["completed", "insufficient_data"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("price_recommendations").select("*").eq("vehicle_id", id).order("created_at", { ascending: false }).limit(10),
    supabase.rpc("vehicle_timeline", { p_vehicle: id }),
    supabase.from("enquiries").select("id, enquiry_type, buyer_display_name, enquiry_status, created_at, offer_amount").eq("vehicle_id", id).order("created_at", { ascending: false }).limit(10),
    supabase.from("transactions").select("id, agreed_price, sale_status, created_at").eq("vehicle_id", id).not("sale_status", "in", "(fell_through,cancelled)").maybeSingle(),
  ]);
  const l = listing as Listing | null;
  const { data: comps } = valuation ? await supabase.from("comparable_vehicles").select("*").eq("valuation_id", valuation.id).order("similarity", { ascending: false }) : { data: [] };
  const { data: drafts } = l ? await supabase.from("listing_content_drafts").select("id, source, title, short_description, description, highlights, created_at").eq("listing_id", l.id).eq("draft_status", "pending").order("created_at", { ascending: false }) : { data: [] };

  const status = v.vehicle_status;
  const live = ["published", "receiving_enquiries", "viewing_arranged", "offer_received"].includes(status);
  const editable = SELLER_EDITABLE_STATUSES.includes(status);
  const stageIdx = MAIN_PATH.findIndex((s) => VEHICLE_STATUS_META[s].stage >= VEHICLE_STATUS_META[status].stage);
  const t = terms as SaleTerms | null;

  return (
    <>
      <PageHeader eyebrow="My vehicles" title={vehicleName(v)}
        description={<span className="inline-flex flex-wrap items-center gap-2"><VehicleStatusBadge status={status} />{l ? <ListingStatusBadge status={l.listing_status} /> : null}<span>{v.registration_number}</span></span>}
        actions={<>
          {live && l ? <Button asChild variant="secondary"><Link href={`/cars/${l.slug}`} target="_blank"><ExternalLink />View live listing</Link></Button> : null}
          {["draft", "awaiting_information"].includes(status) ? <Button asChild><Link href={`/dashboard/vehicles/${id}/submit`}>{status === "draft" ? "Continue submission" : "Update & resubmit"}</Link></Button> : null}
        </>} />

      {sp.submitted ? <Alert tone="success" className="mb-6" title="Vehicle submitted">Thank you. Our team will review your vehicle and contact you if anything else is needed.</Alert> : null}
      {status === "awaiting_information" || l?.information_request ? <Alert tone="warning" className="mb-6" title="Meridian needs more information">{l?.information_request ?? "Please review your submission and add any missing details, then resubmit."}</Alert> : null}
      {status === "awaiting_seller_approval" ? <Alert tone="info" className="mb-6" title="Your approval is needed">Review your valuation and listing below, set your asking price and minimum, then approve your listing for publication.</Alert> : null}
      {l?.rejection_reason && status === "rejected" ? <Alert tone="danger" className="mb-6" title="Listing not approved">{l.rejection_reason}</Alert> : null}
      {tx ? <Alert tone="info" className="mb-6" title="Sale reported">Sale at {formatPrice(tx.agreed_price)} — {tx.sale_status === "completed" ? "completed." : "awaiting confirmation by Meridian."}</Alert> : null}

      {!["withdrawn", "rejected", "cancelled", "draft"].includes(status) ? (
        <Card className="mb-8 overflow-x-auto p-5">
          <ol className="flex min-w-[640px] items-center">
            {MAIN_PATH.map((s, i) => (
              <li key={s} className="flex flex-1 items-center">
                <div className="flex flex-col items-center gap-1.5 text-center">
                  <span className={cn("size-3 rounded-full border-2", i < stageIdx || status === "completed" ? "border-success bg-success" : i === stageIdx ? "border-accent bg-accent" : "border-line bg-white")} />
                  <span className={cn("text-[11px]", i === stageIdx ? "font-semibold text-ink" : "text-muted")}>{VEHICLE_STATUS_META[s].label}</span>
                </div>
                {i < MAIN_PATH.length - 1 ? <span className={cn("mx-1 h-px flex-1", i < stageIdx ? "bg-success" : "bg-line")} /> : null}
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      {l?.published_at ? (
        <div className="mb-8 grid grid-cols-3 gap-4">
          <StatCard label="Views" value={l.view_count} icon={<Eye />} />
          <StatCard label="Saves" value={l.save_count} icon={<Heart />} />
          <StatCard label="Enquiries" value={l.enquiry_count} icon={<MessageSquare />} tone="accent" />
        </div>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-8 min-w-0">
          <Card id="pricing">
            <CardHeader title="Valuation & pricing" description="Indicative valuation, recommendations and your authorised prices." />
            <CardBody>
              <ValuationPanel vehicleId={id} valuation={valuation as Valuation | null} comparables={(comps ?? []) as Comparable[]} recommendations={(recs ?? []) as PriceRecommendation[]}
                askingPrice={l?.asking_price ?? t?.desired_asking_price ?? null} minimumPrice={t?.minimum_authorised_price ?? null}
                canRequest={!["completed", "cancelled", "rejected"].includes(status) && v.make != null} canEditPrice={!["completed", "cancelled", "sale_agreed", "payment_pending", "handover_pending"].includes(status) && status !== "draft"} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Listing" description={l?.seller_approved_at ? `You approved this listing ${timeAgo(l.seller_approved_at)}` : "Review the listing copy and approve it for publication."} />
            <CardBody>
              <ListingEditor vehicleId={id} title={l?.title ?? ""} description={l?.description ?? ""} hasListing={!!l}
                canEdit={!!l && !["published", "sold"].includes(l.listing_status) && !["completed", "cancelled"].includes(status)}
                canApprove={!!l && ["awaiting_seller_approval", "valuation_completed", "verification_pending", "submitted"].includes(status)}
                sellerApproved={!!l?.seller_approved_at} drafts={drafts ?? []} aiConfigured={isAiConfigured()} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Photographs" description={editable ? "Add, reorder or remove photographs." : "Photographs are locked while your listing is live. Request assistance to change them."} />
            <CardBody><ImageManager vehicleId={id} images={images ?? []} editable={editable} /></CardBody>
          </Card>
          <Card>
            <CardHeader title="Documents" />
            <CardBody><DocumentManager vehicleId={id} documents={documents ?? []} /></CardBody>
          </Card>
        </div>
        <div className="space-y-8">
          <Card>
            <CardHeader title="Actions" />
            <CardBody className="space-y-4">
              <VehicleActions vehicleId={id} status={status} askingPrice={l?.asking_price ?? null} isDraft={status === "draft"}
                canReportSale={live || ["sale_agreed", "payment_pending", "handover_pending"].includes(status)}
                canWithdraw={!["completed", "withdrawn", "rejected", "cancelled", "draft", "sale_agreed", "payment_pending", "handover_pending"].includes(status)} />
              {l?.published_at ? <div className="border-t border-line pt-4"><InsightsPanel vehicleId={id} /></div> : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Enquiries" action={<Button asChild variant="link" size="sm"><Link href="/dashboard/enquiries">All enquiries</Link></Button>} />
            {enquiries?.length ? (
              <ul className="divide-y divide-line">
                {enquiries.map((e) => (
                  <li key={e.id}><Link href={`/dashboard/enquiries/${e.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-[13.5px] hover:bg-paper">
                    <span><span className="font-medium text-ink">{e.buyer_display_name ?? "Buyer"}</span> · {ENQUIRY_TYPE_LABELS[e.enquiry_type as keyof typeof ENQUIRY_TYPE_LABELS]}{e.offer_amount ? ` · ${formatPrice(e.offer_amount)}` : ""}<span className="block text-[12px] text-muted">{timeAgo(e.created_at)}</span></span>
                    <EnquiryStatusBadge status={e.enquiry_status as EnquiryStatus} />
                  </Link></li>
                ))}
              </ul>
            ) : <CardBody><p className="text-[13.5px] text-muted">No enquiries yet.</p></CardBody>}
          </Card>
          <Card>
            <CardHeader title="Timeline" />
            <CardBody>
              <ol className="space-y-4 border-l border-line pl-5">
                {(timeline ?? []).map((h: { new_status: VehicleStatus; reason: string | null; created_at: string }, i: number) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[25px] top-1 size-2.5 rounded-full border-2 border-white bg-silver" />
                    <p className="text-[13.5px] font-medium text-ink">{VEHICLE_STATUS_META[h.new_status].label}</p>
                    {h.reason ? <p className="text-[12.5px] text-slate">{h.reason}</p> : null}
                    <p className="text-[11.5px] text-muted">{formatDateTime(h.created_at)}</p>
                  </li>
                ))}
                <li className="relative"><span className="absolute -left-[25px] top-1 size-2.5 rounded-full border-2 border-white bg-line" /><p className="text-[13.5px] text-muted">Draft created · {formatDateTime(v.created_at)}</p></li>
              </ol>
              <p className="mt-4 text-[11.5px] text-muted">Pipeline: {PIPELINE_ORDER.length} stages from submission to completion.</p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
