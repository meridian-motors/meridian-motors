"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession, requireUser } from "@/lib/auth";
import { fail, ok, zodFieldErrors, dbErrorMessage, type ActionResult } from "@/lib/action-result";
import { STEP_SCHEMAS, MIN_PHOTOS } from "@/lib/validation/vehicle";
import { lookupRegistration, mapDvlaFuel, type DvlaVehicle } from "@/lib/dvla";
import { runValuation } from "@/lib/pricing/service";
import { rateLimit } from "@/lib/rate-limit";
import { geocodeOutcode } from "@/lib/geo";
import { notify, notifyStaff } from "@/lib/notifications";
import { aiGenerateListing, aiMarketIntelligence } from "@/lib/ai/tasks";
import { priceReviewSignal } from "@/lib/pricing/engine";
import { createCheckoutSession } from "@/lib/stripe";
import type { Vehicle } from "@/lib/types";

const uuid = z.uuid();

async function ownedVehicle(vehicleId: string) {
  if (!uuid.safeParse(vehicleId).success) return null;
  const supabase = await createClient();
  const session = await getSession();
  if (!session?.sellerId) return null;
  const { data } = await supabase.from("vehicles").select("*").eq("id", vehicleId).eq("owner_id", session.sellerId).is("deleted_at", null).maybeSingle();
  return data ? { vehicle: data as Vehicle, supabase, session } : null;
}

// ---------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------
export async function startSubmission() {
  await requireUser("/dashboard/vehicles/new");
  const supabase = await createClient();
  const { data: sellerId, error: sErr } = await supabase.rpc("ensure_seller");
  if (sErr) throw new Error(dbErrorMessage(sErr));
  // Resume an existing draft rather than creating duplicates.
  const { data: draft } = await supabase.from("vehicles").select("id").eq("owner_id", sellerId).eq("vehicle_status", "draft").is("deleted_at", null)
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (draft) redirect(`/dashboard/vehicles/${draft.id}/submit`);
  const { data, error } = await supabase.from("vehicles").insert({ owner_id: sellerId }).select("id").single();
  if (error) throw new Error(dbErrorMessage(error));
  redirect(`/dashboard/vehicles/${data.id}/submit`);
}

export async function startNewSubmission() {
  await requireUser("/dashboard/vehicles/new");
  const supabase = await createClient();
  const { data: sellerId, error: sErr } = await supabase.rpc("ensure_seller");
  if (sErr) throw new Error(dbErrorMessage(sErr));
  const { data, error } = await supabase.from("vehicles").insert({ owner_id: sellerId }).select("id").single();
  if (error) throw new Error(dbErrorMessage(error));
  redirect(`/dashboard/vehicles/${data.id}/submit`);
}

type StepNum = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Autosave: stores raw form values without validation so sellers can return later. */
export async function autosaveStep(vehicleId: string, step: StepNum, values: Record<string, unknown>): Promise<ActionResult> {
  const owned = await ownedVehicle(vehicleId);
  if (!owned) return fail("Vehicle not found");
  const json = JSON.stringify(values);
  if (json.length > 20000) return fail("Too much data");
  const submission = { ...(owned.vehicle.submission_data ?? {}), [`step${step}`]: values, saved_at: new Date().toISOString() };
  const { error } = await owned.supabase.from("vehicles").update({ submission_data: submission }).eq("id", vehicleId);
  return error ? fail(dbErrorMessage(error)) : ok();
}

/** Validates a step and writes it to the structured columns. */
export async function saveStep(vehicleId: string, step: StepNum, values: Record<string, unknown>): Promise<ActionResult<{ next: number }>> {
  const owned = await ownedVehicle(vehicleId);
  if (!owned) return fail("Vehicle not found");
  const { vehicle, supabase } = owned;
  const editable = ["draft", "awaiting_information", "submitted", "verification_pending", "withdrawn"].includes(vehicle.vehicle_status);
  if (!editable && step <= 6) return fail("These details are locked while Meridian reviews your vehicle. Use 'Request assistance' to change them.");

  const submission = { ...(vehicle.submission_data ?? {}), [`step${step}`]: values, saved_at: new Date().toISOString() };
  const nextStep = Math.min(8, Math.max(vehicle.submission_step, step + 1));

  if (step === 5) {
    const { count } = await supabase.from("vehicle_images").select("id", { count: "exact", head: true }).eq("vehicle_id", vehicleId);
    if ((count ?? 0) < MIN_PHOTOS) return fail(`Please add at least ${MIN_PHOTOS} photographs, including the exterior and the mileage display.`);
    const { error } = await supabase.from("vehicles").update({ submission_data: submission, submission_step: nextStep }).eq("id", vehicleId);
    return error ? fail(dbErrorMessage(error)) : ok({ next: step + 1 });
  }
  if (step === 7) {
    const { error } = await supabase.from("vehicles").update({ submission_data: submission, submission_step: nextStep }).eq("id", vehicleId);
    return error ? fail(dbErrorMessage(error)) : ok({ next: 8 });
  }

  const schema = STEP_SCHEMAS[step as keyof typeof STEP_SCHEMAS];
  if (!schema) return fail("Unknown step");
  const parsed = schema.safeParse(values);
  if (!parsed.success) return fail("Please check the highlighted fields.", zodFieldErrors(parsed.error.issues));
  const d = parsed.data as Record<string, unknown>;

  let update: Record<string, unknown> = {};
  if (step === 1) {
    update = { registration_number: d.registration_number, make: d.make, model: d.model, derivative: d.derivative ?? null, year: d.year, vin: d.vin ?? null };
    // Duplicate check against live vehicles (the unique index is authoritative)
    const admin = createAdminClient();
    const { data: dup } = await admin.from("vehicles").select("id").eq("registration_number", d.registration_number as string).neq("id", vehicleId)
      .is("deleted_at", null).not("vehicle_status", "in", "(completed,withdrawn,rejected,cancelled)").limit(1).maybeSingle();
    if (dup) return fail("A vehicle with this registration is already being sold on Meridian Motors. Please contact us if this is your vehicle.", { registration_number: "Already listed" });
  } else if (step === 2) {
    update = { ...d };
  } else if (step === 3) {
    const { disclosures_confirmed: _c, ...rest } = d; void _c;
    update = { ...rest, disclosures_confirmed_at: new Date().toISOString() };
  } else if (step === 4) {
    update = { ...d };
    // Seller-entered MOT dates are 'seller' provenance; upgraded to 'dvla' below only when they match a recorded DVLA lookup.
    if (d.mot_expiry) update.mot_source = "seller";
  } else if (step === 6) {
    const coords = await geocodeOutcode(d.postcode as string);
    update = { location: d.location, postcode: d.postcode, description: d.description ?? null, latitude: coords?.lat ?? null, longitude: coords?.lng ?? null };
    const { error: tErr } = await supabase.from("vehicle_sale_terms").upsert({
      vehicle_id: vehicleId, desired_asking_price: d.desired_asking_price, expected_selling_price: d.expected_selling_price ?? null,
      minimum_authorised_price: d.minimum_authorised_price, preferred_contact_method: d.preferred_contact_method, seller_comments: d.seller_comments ?? null,
    }, { onConflict: "vehicle_id" });
    if (tErr) return fail(dbErrorMessage(tErr));
  }

  const { error } = await supabase.from("vehicles").update({ ...update, submission_data: submission, submission_step: nextStep }).eq("id", vehicleId);
  if (error) return fail(error.code === "23505" ? "A vehicle with this registration or VIN is already listed." : dbErrorMessage(error));

  if (step === 4 && update.mot_expiry) {
    const dvla = (vehicle.submission_data as { dvla?: DvlaVehicle }).dvla;
    if (dvla?.motExpiryDate === update.mot_expiry) {
      // Provenance upgrade is a trusted server operation tied to a recorded DVLA lookup.
      await createAdminClient().from("vehicles").update({ mot_source: "dvla" }).eq("id", vehicleId);
    }
  }
  revalidatePath(`/dashboard/vehicles/${vehicleId}`);
  return ok({ next: step + 1 });
}

export async function dvlaLookup(vehicleId: string, registration: string): Promise<ActionResult<{ make?: string; colour?: string; fuel_type?: string | null; year?: number; engine_size?: number; mot_expiry?: string; motStatus?: string; taxStatus?: string; lookedUpAt: string }>> {
  const owned = await ownedVehicle(vehicleId);
  if (!owned) return fail("Vehicle not found");
  const res = await lookupRegistration(registration, owned.session.userId);
  if (res.status !== "success") return fail(res.message);
  const v = res.vehicle;
  const admin = createAdminClient();
  await admin.from("vehicles").update({ submission_data: { ...(owned.vehicle.submission_data ?? {}), dvla: v, dvla_looked_up_at: res.lookedUpAt } }).eq("id", vehicleId);
  await admin.from("vehicle_checks").insert({
    vehicle_id: vehicleId, check_type: "dvla_vehicle_enquiry", provider: "DVLA Vehicle Enquiry Service", result: "pass",
    summary: `DVLA records: ${[v.make, v.colour, v.fuelType?.toLowerCase(), v.yearOfManufacture].filter(Boolean).join(", ")}${v.motExpiryDate ? `; MOT valid until ${v.motExpiryDate}` : ""}.`,
    limitations: "Confirms vehicle details held by the DVLA only. Does not confirm ownership, finance, write-off status or full history.",
    raw_response: v, reference_id: v.registrationNumber, is_public: false,
  });
  const make = v.make ? v.make.charAt(0) + v.make.slice(1).toLowerCase() : undefined;
  return ok({ make, colour: v.colour ? v.colour.charAt(0) + v.colour.slice(1).toLowerCase() : undefined, fuel_type: mapDvlaFuel(v.fuelType),
    year: v.yearOfManufacture, engine_size: v.engineCapacity, mot_expiry: v.motExpiryDate, motStatus: v.motStatus, taxStatus: v.taxStatus, lookedUpAt: res.lookedUpAt });
}

// ---------------------------------------------------------------------------
// Images & documents (files are uploaded directly to Storage under RLS; these
// actions validate and record them)
// ---------------------------------------------------------------------------
const imageSchema = z.object({
  vehicleId: z.uuid(), path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/),
  imageType: z.enum(["exterior", "interior", "dashboard", "mileage", "damage", "engine", "boot", "wheels", "other"]),
  width: z.number().int().positive().max(10000).optional(), height: z.number().int().positive().max(10000).optional(),
});

export async function recordImage(input: z.infer<typeof imageSchema>): Promise<ActionResult> {
  const p = imageSchema.safeParse(input);
  if (!p.success || !p.data.path.startsWith(`${p.data.vehicleId}/`)) return fail("Invalid image");
  const supabase = await createClient();
  const session = await getSession();
  if (!session) return fail("Please sign in");
  const { data: pub } = supabase.storage.from("vehicle-images").getPublicUrl(p.data.path);
  const { count } = await supabase.from("vehicle_images").select("id", { count: "exact", head: true }).eq("vehicle_id", p.data.vehicleId);
  if ((count ?? 0) >= 40) return fail("A maximum of 40 photographs can be added.");
  const { error } = await supabase.from("vehicle_images").insert({
    vehicle_id: p.data.vehicleId, storage_path: p.data.path, public_url: pub.publicUrl, image_type: p.data.imageType,
    display_order: count ?? 0, is_primary: (count ?? 0) === 0, width: p.data.width, height: p.data.height, uploaded_by: session.userId,
  });
  if (error) {
    await supabase.storage.from("vehicle-images").remove([p.data.path]);
    return fail(dbErrorMessage(error));
  }
  revalidatePath(`/dashboard/vehicles/${p.data.vehicleId}`);
  return ok();
}

export async function deleteImage(imageId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: img } = await supabase.from("vehicle_images").select("id, vehicle_id, storage_path, is_primary").eq("id", imageId).maybeSingle();
  if (!img) return fail("Image not found");
  const { error } = await supabase.from("vehicle_images").delete().eq("id", imageId);
  if (error) return fail(dbErrorMessage(error));
  await supabase.storage.from("vehicle-images").remove([img.storage_path]);
  if (img.is_primary) {
    const { data: next } = await supabase.from("vehicle_images").select("id").eq("vehicle_id", img.vehicle_id).order("display_order").limit(1).maybeSingle();
    if (next) await supabase.from("vehicle_images").update({ is_primary: true }).eq("id", next.id);
  }
  revalidatePath(`/dashboard/vehicles/${img.vehicle_id}`);
  return ok();
}

export async function setPrimaryImage(imageId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: img } = await supabase.from("vehicle_images").select("vehicle_id").eq("id", imageId).maybeSingle();
  if (!img) return fail("Image not found");
  await supabase.from("vehicle_images").update({ is_primary: false }).eq("vehicle_id", img.vehicle_id).eq("is_primary", true);
  const { error } = await supabase.from("vehicle_images").update({ is_primary: true }).eq("id", imageId);
  if (error) return fail(dbErrorMessage(error));
  revalidatePath(`/dashboard/vehicles/${img.vehicle_id}`);
  return ok();
}

export async function reorderImages(vehicleId: string, orderedIds: string[]): Promise<ActionResult> {
  if (!z.array(z.uuid()).max(40).safeParse(orderedIds).success) return fail("Invalid order");
  const supabase = await createClient();
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from("vehicle_images").update({ display_order: i }).eq("id", orderedIds[i]).eq("vehicle_id", vehicleId);
    if (error) return fail(dbErrorMessage(error));
  }
  revalidatePath(`/dashboard/vehicles/${vehicleId}`);
  return ok();
}

const docSchema = z.object({
  vehicleId: z.uuid(), path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|jpeg|png|webp)$/),
  documentType: z.enum(["v5c", "service_record", "mot_certificate", "invoice", "finance_settlement", "inspection_report", "other"]),
  fileName: z.string().min(1).max(200), mimeType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]), size: z.number().int().min(1).max(15 * 1024 * 1024),
});

export async function recordDocument(input: z.infer<typeof docSchema>): Promise<ActionResult> {
  const p = docSchema.safeParse(input);
  if (!p.success || !p.data.path.startsWith(`${p.data.vehicleId}/`)) return fail("Invalid document");
  const session = await getSession();
  if (!session) return fail("Please sign in");
  const supabase = await createClient();
  const { error } = await supabase.from("vehicle_documents").insert({
    vehicle_id: p.data.vehicleId, document_type: p.data.documentType, storage_path: p.data.path, file_name: p.data.fileName.replace(/[^\w.\- ]/g, "_"),
    mime_type: p.data.mimeType, size_bytes: p.data.size, uploaded_by: session.userId,
  });
  if (error) { await supabase.storage.from("vehicle-documents").remove([p.data.path]); return fail(dbErrorMessage(error)); }
  revalidatePath("/dashboard/documents");
  revalidatePath(`/dashboard/vehicles/${p.data.vehicleId}`);
  return ok();
}

export async function deleteDocument(documentId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: doc } = await supabase.from("vehicle_documents").select("id, storage_path, vehicle_id").eq("id", documentId).maybeSingle();
  if (!doc) return fail("Document not found");
  const { error } = await supabase.from("vehicle_documents").delete().eq("id", documentId);
  if (error) return fail(dbErrorMessage(error));
  await supabase.storage.from("vehicle-documents").remove([doc.storage_path]);
  revalidatePath("/dashboard/documents");
  return ok();
}

/** Short-lived signed URL for a private document (owner or staff, enforced by RLS). */
export async function getDocumentUrl(documentId: string): Promise<ActionResult<{ url: string }>> {
  const supabase = await createClient();
  const { data: doc } = await supabase.from("vehicle_documents").select("storage_path, vehicle_id").eq("id", documentId).maybeSingle();
  if (!doc) return fail("Document not found");
  const { data, error } = await supabase.storage.from("vehicle-documents").createSignedUrl(doc.storage_path, 120);
  if (error || !data) return fail("Could not open document");
  await supabase.rpc("log_audit", { p_action: "document_viewed", p_entity_type: "vehicle_documents", p_entity_id: documentId, p_details: { vehicle_id: doc.vehicle_id } });
  return ok({ url: data.signedUrl });
}

// ---------------------------------------------------------------------------
// Valuation & pricing
// ---------------------------------------------------------------------------
export async function requestValuation(vehicleId: string): Promise<ActionResult> {
  const owned = await ownedVehicle(vehicleId);
  if (!owned) return fail("Vehicle not found");
  if (!(await rateLimit(`valuation:${vehicleId}`, 4, 86400))) return fail("You can request up to 4 valuations per day for each vehicle.");
  try {
    await runValuation(vehicleId, owned.session.userId);
  } catch (e) {
    console.error("[valuation]", e);
    return fail((e as Error).message.includes("required") ? (e as Error).message : "We couldn't complete the valuation. Please try again later.");
  }
  revalidatePath(`/dashboard/vehicles/${vehicleId}`);
  revalidatePath("/dashboard/valuations");
  return ok();
}

export async function decideRecommendation(recommendationId: string, accept: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: rec } = await supabase.from("price_recommendations").select("vehicle_id").eq("id", recommendationId).maybeSingle();
  if (!rec) return fail("Recommendation not found");
  const { data: listing } = await supabase.from("listings").select("id").eq("vehicle_id", rec.vehicle_id).is("deleted_at", null).maybeSingle();
  if (accept && !listing) {
    const { data: r } = await supabase.from("price_recommendations").select("recommended_price").eq("id", recommendationId).single();
    const { data: terms } = await supabase.from("vehicle_sale_terms").select("minimum_authorised_price").eq("vehicle_id", rec.vehicle_id).maybeSingle();
    if (!r) return fail("Recommendation not found");
    if (terms?.minimum_authorised_price && r.recommended_price < terms.minimum_authorised_price) {
      return fail("This price is below your authorised minimum. Lower your minimum first if you want to accept it.");
    }
    const { error: tErr } = await supabase.from("vehicle_sale_terms").update({ desired_asking_price: r.recommended_price }).eq("vehicle_id", rec.vehicle_id);
    if (tErr) return fail(dbErrorMessage(tErr));
  }
  const { error } = await supabase.rpc("decide_price_recommendation", { p_recommendation: recommendationId, p_accept: accept, p_apply: !!listing });
  if (error) return fail(dbErrorMessage(error));
  revalidatePath(`/dashboard/vehicles/${rec.vehicle_id}`);
  revalidatePath("/dashboard");
  return ok();
}

export async function updatePricing(vehicleId: string, askingPrice: number, minimumPrice: number, reason?: string): Promise<ActionResult> {
  const owned = await ownedVehicle(vehicleId);
  if (!owned) return fail("Vehicle not found");
  const p = z.object({ a: z.number().int().min(100).max(5_000_000), m: z.number().int().min(100).max(5_000_000) }).safeParse({ a: askingPrice, m: minimumPrice });
  if (!p.success) return fail("Enter valid prices between £100 and £5,000,000.");
  if (minimumPrice > askingPrice) return fail("Your minimum can't be above your asking price.");
  const { supabase } = owned;
  const { data: listing } = await supabase.from("listings").select("id, asking_price").eq("vehicle_id", vehicleId).is("deleted_at", null).maybeSingle();
  // Order matters so the minimum never exceeds the live price, and the live price never drops below the minimum.
  if (listing && listing.asking_price != null && askingPrice < listing.asking_price) {
    const { error: e1 } = await supabase.from("vehicle_sale_terms").update({ minimum_authorised_price: minimumPrice, desired_asking_price: askingPrice }).eq("vehicle_id", vehicleId);
    if (e1) return fail(dbErrorMessage(e1));
    const { error: e2 } = await supabase.rpc("set_asking_price", { p_listing: listing.id, p_price: askingPrice, p_reason: reason ?? "Seller updated price" });
    if (e2) return fail(dbErrorMessage(e2));
  } else {
    if (listing) {
      const { error: e2 } = await supabase.rpc("set_asking_price", { p_listing: listing.id, p_price: askingPrice, p_reason: reason ?? "Seller updated price" });
      if (e2) return fail(dbErrorMessage(e2));
    }
    const { error: e1 } = await supabase.from("vehicle_sale_terms").upsert({ vehicle_id: vehicleId, minimum_authorised_price: minimumPrice, desired_asking_price: askingPrice }, { onConflict: "vehicle_id" });
    if (e1) return fail(dbErrorMessage(e1));
  }
  revalidatePath(`/dashboard/vehicles/${vehicleId}`);
  return ok(undefined, "Pricing updated.");
}

// ---------------------------------------------------------------------------
// Submission & lifecycle
// ---------------------------------------------------------------------------
export async function submitVehicle(vehicleId: string, declaration: boolean): Promise<ActionResult> {
  if (!declaration) return fail("Please confirm the seller declaration.");
  const owned = await ownedVehicle(vehicleId);
  if (!owned) return fail("Vehicle not found");
  const { vehicle: v, supabase, session } = owned;
  if (!["draft", "awaiting_information", "withdrawn"].includes(v.vehicle_status)) return fail("This vehicle has already been submitted.");
  if (v.submission_step < 8) return fail("Please complete every step first.");
  const { data: terms } = await supabase.from("vehicle_sale_terms").select("*").eq("vehicle_id", vehicleId).maybeSingle();
  if (!terms?.desired_asking_price || !terms.minimum_authorised_price) return fail("Please complete your selling details.");

  const { error: dErr } = await supabase.from("vehicles").update({ seller_declaration_at: new Date().toISOString() }).eq("id", vehicleId);
  if (dErr) return fail(dbErrorMessage(dErr));
  await supabase.from("consent_records").insert({ profile_id: session.userId, consent_type: "seller_declaration", granted: true, policy_version: "2026-11-draft" });

  // Create the listing draft from the seller's own information (no AI claims).
  const { data: existing } = await supabase.from("listings").select("id").eq("vehicle_id", vehicleId).is("deleted_at", null).maybeSingle();
  if (!existing) {
    const title = [v.year, v.make, v.model, v.derivative].filter(Boolean).join(" ").slice(0, 140);
    const { error: lErr } = await supabase.from("listings").insert({
      vehicle_id: vehicleId, title, description: v.description, asking_price: terms.desired_asking_price, location: v.location,
    });
    if (lErr) return fail(dbErrorMessage(lErr));
  }
  const { error } = await supabase.rpc("transition_vehicle_status", { p_vehicle: vehicleId, p_new_status: "submitted", p_reason: v.vehicle_status === "awaiting_information" ? "Seller provided requested information" : "Seller submitted vehicle" });
  if (error) return fail(dbErrorMessage(error));
  await notify(session.userId, "submission_received", "Your vehicle submission has been received",
    `Thank you for submitting your ${v.year} ${v.make} ${v.model}. Our team will review it and be in touch.`, `/dashboard/vehicles/${vehicleId}`);
  await notifyStaff("vehicle_submitted", "New vehicle submission", `${v.year} ${v.make} ${v.model} submitted for review`, `/admin/inventory/${vehicleId}`);
  revalidatePath("/dashboard", "layout");
  return ok();
}

export async function sellerApproveListing(vehicleId: string): Promise<ActionResult> {
  const owned = await ownedVehicle(vehicleId);
  if (!owned) return fail("Vehicle not found");
  const { supabase, vehicle } = owned;
  const { data: listing } = await supabase.from("listings").select("id").eq("vehicle_id", vehicleId).is("deleted_at", null).maybeSingle();
  if (!listing) return fail("Listing not found");
  const { error } = await supabase.rpc("seller_approve_listing", { p_listing: listing.id });
  if (error) return fail(dbErrorMessage(error));
  if (vehicle.vehicle_status === "awaiting_seller_approval") {
    const { error: tErr } = await supabase.rpc("transition_vehicle_status", { p_vehicle: vehicleId, p_new_status: "approved_for_publication", p_reason: "Seller approved listing and price" });
    if (tErr) return fail(dbErrorMessage(tErr));
    await notifyStaff("listing_seller_approved", "Seller approved listing", `${vehicle.year} ${vehicle.make} ${vehicle.model} is ready for publication`, `/admin/inventory/${vehicleId}`);
  }
  revalidatePath(`/dashboard/vehicles/${vehicleId}`);
  return ok(undefined, "Listing approved.");
}

export async function updateListingCopy(vehicleId: string, title: string, description: string): Promise<ActionResult> {
  const owned = await ownedVehicle(vehicleId);
  if (!owned) return fail("Vehicle not found");
  const p = z.object({ title: z.string().trim().min(5).max(140), description: z.string().trim().min(20).max(6000) }).safeParse({ title, description });
  if (!p.success) return fail("Title must be 5–140 characters and description 20–6,000 characters.");
  const { error } = await owned.supabase.from("listings").update({ title: p.data.title, description: p.data.description }).eq("vehicle_id", vehicleId).is("deleted_at", null);
  if (error) return fail(dbErrorMessage(error));
  revalidatePath(`/dashboard/vehicles/${vehicleId}`);
  return ok(undefined, "Listing text saved. Meridian will review the change.");
}

export async function decideListingDraft(draftId: string, approve: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = approve
    ? await supabase.rpc("approve_listing_draft", { p_draft: draftId })
    : await supabase.rpc("reject_listing_draft", { p_draft: draftId });
  if (error) return fail(dbErrorMessage(error));
  revalidatePath("/dashboard", "layout");
  return ok();
}

/** AI listing generation from confirmed facts. Result is a DRAFT requiring approval. */
export async function generateListingDraft(vehicleId: string): Promise<ActionResult> {
  const owned = await ownedVehicle(vehicleId);
  if (!owned) return fail("Vehicle not found");
  return createAiDraft(vehicleId, owned.vehicle, owned.session.userId);
}

export async function createAiDraft(vehicleId: string, vehicle: Vehicle, userId: string): Promise<ActionResult> {
  const admin = createAdminClient();
  const { data: listing } = await admin.from("listings").select("id, listing_status").eq("vehicle_id", vehicleId).is("deleted_at", null).maybeSingle();
  if (!listing) return fail("Submit your vehicle first so a listing exists.");
  const [{ data: checks }, { data: verifications }] = await Promise.all([
    admin.from("vehicle_checks").select("check_type, provider, result, checked_at, summary").eq("vehicle_id", vehicleId),
    admin.from("vehicle_verifications").select("verification_type, status, verified_at").eq("vehicle_id", vehicleId).eq("status", "verified"),
  ]);
  const res = await aiGenerateListing(vehicle, { checks: checks ?? [], verifications: verifications ?? [] }, userId);
  if (!res.ok) return fail(res.message);
  const { error } = await admin.from("listing_content_drafts").insert({
    listing_id: listing.id, source: "ai", title: res.data.title, short_description: res.data.short_description, description: res.data.description,
    highlights: res.data.highlights, search_tags: res.data.search_tags, ai_run_id: res.runId, created_by: userId,
  });
  if (error) return fail(dbErrorMessage(error));
  revalidatePath(`/dashboard/vehicles/${vehicleId}`);
  return ok(undefined, "A draft listing has been generated for your review.");
}

export async function withdrawVehicle(vehicleId: string, reason: string): Promise<ActionResult> {
  const owned = await ownedVehicle(vehicleId);
  if (!owned) return fail("Vehicle not found");
  const { error } = await owned.supabase.rpc("transition_vehicle_status", { p_vehicle: vehicleId, p_new_status: "withdrawn", p_reason: reason.slice(0, 500) || "Withdrawn by seller" });
  if (error) return fail(dbErrorMessage(error));
  revalidatePath("/dashboard", "layout");
  return ok(undefined, "Your vehicle has been withdrawn.");
}

export async function deleteDraft(vehicleId: string): Promise<ActionResult> {
  const owned = await ownedVehicle(vehicleId);
  if (!owned || owned.vehicle.vehicle_status !== "draft") return fail("Only drafts can be deleted.");
  const { data: imgs } = await owned.supabase.from("vehicle_images").select("storage_path").eq("vehicle_id", vehicleId);
  if (imgs?.length) await owned.supabase.storage.from("vehicle-images").remove(imgs.map((i) => i.storage_path));
  const { error } = await owned.supabase.from("vehicles").delete().eq("id", vehicleId);
  if (error) return fail(dbErrorMessage(error));
  revalidatePath("/dashboard/vehicles");
  return ok();
}

export async function reportSale(vehicleId: string, price: number, notes: string): Promise<ActionResult> {
  const owned = await ownedVehicle(vehicleId);
  if (!owned) return fail("Vehicle not found");
  if (!Number.isInteger(price) || price < 100) return fail("Enter the agreed sale price.");
  const { error } = await owned.supabase.rpc("seller_report_sale", { p_vehicle: vehicleId, p_price: price, p_notes: notes.slice(0, 1000) || null });
  if (error) return fail(dbErrorMessage(error));
  await notifyStaff("sale_reported", "Seller reported a sale", `${owned.vehicle.year} ${owned.vehicle.make} ${owned.vehicle.model} — £${price.toLocaleString("en-GB")}`, `/admin/sales`);
  revalidatePath(`/dashboard/vehicles/${vehicleId}`);
  return ok(undefined, "Thank you. Meridian will confirm the sale with you before it is marked complete.");
}

export async function requestAssistance(_: unknown, formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return fail("Please sign in");
  const p = z.object({ topic: z.enum(["listing_change", "pricing", "photos", "enquiries", "viewing", "sale", "other"]), message: z.string().trim().min(5).max(2000), vehicleId: z.union([z.uuid(), z.literal("")]) })
    .safeParse(Object.fromEntries(formData));
  if (!p.success) return fail("Please describe what you need help with.", zodFieldErrors(p.error.issues));
  const supabase = await createClient();
  const { data: sellerId } = await supabase.rpc("ensure_seller");
  const { error } = await supabase.from("assistance_requests").insert({ seller_id: sellerId, vehicle_id: p.data.vehicleId || null, topic: p.data.topic, message: p.data.message });
  if (error) return fail(dbErrorMessage(error));
  await notifyStaff("assistance_request", "Seller requested assistance", p.data.message.slice(0, 120), "/admin/sellers?tab=assistance");
  return ok(undefined, "Request sent. A member of the team will be in touch.");
}

export async function orderService(serviceId: string, vehicleId: string | null, notes: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return fail("Please sign in");
  const supabase = await createClient();
  const { data: sellerId } = await supabase.rpc("ensure_seller");
  const { error } = await supabase.from("service_orders").insert({ seller_id: sellerId, service_id: serviceId, vehicle_id: vehicleId, notes: notes.slice(0, 2000) || null, price: 0, service_type: "pending" });
  if (error) return fail(dbErrorMessage(error));
  await notifyStaff("service_requested", "Service requested", "A seller has requested an assisted-selling service", "/admin/services");
  revalidatePath("/dashboard/services");
  return ok(undefined, "Service requested. We'll confirm details before any payment is taken.");
}

export async function cancelServiceOrder(orderId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("service_orders").update({ service_status: "cancelled" }).eq("id", orderId);
  if (error) return fail(dbErrorMessage(error));
  revalidatePath("/dashboard/services");
  return ok();
}

export async function sellerUpdateEnquiry(enquiryId: string, status: "in_progress" | "awaiting_buyer" | "closed_lost" | "spam"): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("enquiries").update({ enquiry_status: status }).eq("id", enquiryId);
  if (error) return fail(dbErrorMessage(error));
  revalidatePath("/dashboard/enquiries");
  return ok();
}

export async function postMessage(conversationId: string, message: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return fail("Please sign in");
  const text = message.trim();
  if (!text || text.length > 3000) return fail("Messages must be 1–3,000 characters.");
  const supabase = await createClient();
  const { data: conv } = await supabase.from("conversations").select("id, enquiry_id, enquiries(seller_id, buyer_id, vehicle_id, sellers(profile_id), buyers(profile_id))").eq("id", conversationId).maybeSingle();
  if (!conv) return fail("Conversation not found");
  const { error } = await supabase.from("messages").insert({ conversation_id: conversationId, message: text, sender_role: "buyer" });
  if (error) return fail(dbErrorMessage(error));
  // Notify the other participants
  const e = (Array.isArray(conv.enquiries) ? conv.enquiries[0] : conv.enquiries) as unknown as { sellers: { profile_id: string } | null; buyers: { profile_id: string } | null } | null;
  const targets = [e?.sellers?.profile_id, e?.buyers?.profile_id].filter((x): x is string => !!x && x !== session.userId);
  for (const t of targets) await notify(t, "message_received", "New message", "You have a new message about a vehicle enquiry.", "/dashboard/enquiries");
  revalidatePath("/dashboard", "layout");
  revalidatePath("/admin/conversations");
  return ok();
}

export async function markNotificationsRead(ids?: string[]): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return fail("Please sign in");
  const supabase = await createClient();
  let q = supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null).eq("profile_id", session.userId);
  if (ids?.length) q = q.in("id", ids);
  const { error } = await q;
  if (error) return fail(dbErrorMessage(error));
  revalidatePath("/dashboard", "layout");
  return ok();
}

export async function listingInsights(vehicleId: string): Promise<ActionResult<{ reasons: string[]; suggestedPrice: number | null; ai?: { summary: string; suggestions: { type: string; suggestion: string; evidence: string }[] } }>> {
  const owned = await ownedVehicle(vehicleId);
  if (!owned) return fail("Vehicle not found");
  const { supabase, vehicle, session } = owned;
  const [{ data: listing }, { data: valuation }, { data: terms }, { count: photos }] = await Promise.all([
    supabase.from("listings").select("*").eq("vehicle_id", vehicleId).is("deleted_at", null).maybeSingle(),
    supabase.from("valuations").select("*").eq("vehicle_id", vehicleId).eq("valuation_status", "completed").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("vehicle_sale_terms").select("minimum_authorised_price").eq("vehicle_id", vehicleId).maybeSingle(),
    supabase.from("vehicle_images").select("id", { count: "exact", head: true }).eq("vehicle_id", vehicleId),
  ]);
  if (!listing?.published_at) return fail("Insights are available once your listing is live.");
  const daysListed = Math.floor((Date.now() - new Date(listing.published_at).getTime()) / 86400000);
  const signal = priceReviewSignal({ daysListed, views: listing.view_count, enquiries: listing.enquiry_count, saves: listing.save_count,
    askingPrice: listing.asking_price, fastSalePrice: valuation?.fast_sale_price, minimumAuthorised: terms?.minimum_authorised_price });
  const ai = await aiMarketIntelligence({
    vehicle: `${vehicle.year} ${vehicle.make} ${vehicle.model}`, days_listed: daysListed, views: listing.view_count, saves: listing.save_count,
    enquiries: listing.enquiry_count, photo_count: photos ?? 0, description_length: listing.description?.length ?? 0, asking_price: listing.asking_price,
    valuation: valuation ? { market_min: valuation.market_value_min, market_max: valuation.market_value_max, fast_sale: valuation.fast_sale_price } : "none",
    seller_minimum: terms?.minimum_authorised_price ?? null, rule_based_signals: signal.reasons,
  }, session.userId, vehicleId);
  return ok({ reasons: signal.reasons, suggestedPrice: signal.recommend ? signal.suggestedPrice : null, ai: ai.ok ? ai.data : undefined });
}

export async function payPayment(paymentId: string): Promise<ActionResult<{ url: string }>> {
  const session = await getSession();
  if (!session) return fail("Please sign in");
  const supabase = await createClient();
  const { data: p } = await supabase.from("payments").select("*").eq("id", paymentId).eq("profile_id", session.userId).maybeSingle();
  if (!p) return fail("Payment not found");
  if (p.payment_status !== "pending") return fail("This payment is not awaiting payment.");
  const checkout = await createCheckoutSession({ paymentId: p.id, amountPence: p.amount, description: p.description ?? "Meridian Motors fee", customerEmail: session.email });
  if (!checkout?.url) return fail("Online payments are not available yet. Our team will contact you with payment options.");
  await createAdminClient().from("payments").update({ stripe_checkout_session_id: checkout.id }).eq("id", p.id);
  return ok({ url: checkout.url });
}
