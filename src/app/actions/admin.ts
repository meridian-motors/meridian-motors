"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession, isStaffRole, isAdminRole, STAFF } from "@/lib/auth";
import { fail, ok, zodFieldErrors, dbErrorMessage, type ActionResult } from "@/lib/action-result";
import { notify } from "@/lib/notifications";
import { runValuation } from "@/lib/pricing/service";
import { matchPublishedListing } from "@/lib/matching/service";
import { aiAnalyseEnquiry, aiEnrichVehicle } from "@/lib/ai/tasks";
import { validateFeeTiers, type FeeTier } from "@/lib/pricing/fees";
import { getStripe } from "@/lib/stripe";
import { createAiDraft } from "./seller";
import { VEHICLE_STATUS_META } from "@/lib/constants";
import type { AppRole, Vehicle, VehicleStatus } from "@/lib/types";

/** Server-side staff gate for every admin action (RLS enforces again in the database). */
async function staff(roles: AppRole[] = STAFF) {
  const s = await getSession();
  if (!s || !isStaffRole(s.profile.role)) throw new Error("Not permitted");
  if (!isAdminRole(s.profile.role) && !roles.includes(s.profile.role)) throw new Error("Not permitted");
  return { session: s, supabase: await createClient() };
}
const guard = async <T,>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> => {
  try { return await fn(); } catch (e) {
    if (String((e as { digest?: string })?.digest ?? "").startsWith("NEXT_")) throw e; // let redirect()/notFound() through
    return fail((e as Error).message === "Not permitted" ? "You do not have permission to do this." : "Something went wrong.");
  }
};

async function sellerProfileFor(vehicleId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("vehicles").select("make, model, year, sellers(profile_id)").eq("id", vehicleId).maybeSingle();
  const s = (Array.isArray(data?.sellers) ? data?.sellers[0] : data?.sellers) as { profile_id: string } | null;
  return { profileId: s?.profile_id ?? null, name: data ? `${data.year} ${data.make} ${data.model}` : "your vehicle" };
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------
export async function staffTransition(vehicleId: string, status: VehicleStatus, reason: string, notes: string): Promise<ActionResult> {
  return guard(async () => {
    const { supabase } = await staff();
    if (status === "published") return publishVehicle(vehicleId);
    const { error } = await supabase.rpc("transition_vehicle_status", { p_vehicle: vehicleId, p_new_status: status, p_reason: reason || null, p_internal_notes: notes || null });
    if (error) return fail(dbErrorMessage(error));
    const seller = await sellerProfileFor(vehicleId);
    if (seller.profileId && !["receiving_enquiries"].includes(status)) {
      const type = status === "awaiting_information" ? "information_requested" : status === "completed" ? "vehicle_sold" : "listing_update";
      await notify(seller.profileId, type, `Update on your ${seller.name}`, `Status: ${VEHICLE_STATUS_META[status].label}.${reason ? ` ${reason}` : ""}`, `/dashboard/vehicles/${vehicleId}`);
    }
    revalidatePath("/admin", "layout");
    return ok(undefined, `Moved to ${VEHICLE_STATUS_META[status].label}.`);
  });
}

export async function publishVehicle(vehicleId: string): Promise<ActionResult> {
  return guard(async () => {
    const { supabase } = await staff(["sales_operator"]);
    const { error } = await supabase.rpc("transition_vehicle_status", { p_vehicle: vehicleId, p_new_status: "published", p_reason: "Published by Meridian" });
    if (error) return fail(dbErrorMessage(error));
    const { data: listing } = await supabase.from("listings").select("id, slug").eq("vehicle_id", vehicleId).is("deleted_at", null).single();
    const seller = await sellerProfileFor(vehicleId);
    if (seller.profileId) await notify(seller.profileId, "listing_published", "Your vehicle listing is live", `Your ${seller.name} is now published on the Meridian Motors marketplace.`, `/cars/${listing?.slug}`);
    const result = listing ? await matchPublishedListing(listing.id).catch(() => ({ matches: 0, alerts: 0 })) : { matches: 0, alerts: 0 };
    revalidatePath("/admin", "layout");
    revalidatePath("/cars");
    return ok(undefined, `Published. ${result.matches} opted-in buyer match(es) and ${result.alerts} saved-search alert(s) sent.`);
  });
}

export async function reviewListing(vehicleId: string, decision: "approve" | "reject" | "request_information", message: string): Promise<ActionResult> {
  return guard(async () => {
    const { supabase } = await staff(["sales_operator"]);
    const { data: listing } = await supabase.from("listings").select("id").eq("vehicle_id", vehicleId).is("deleted_at", null).maybeSingle();
    if (!listing) return fail("This vehicle has no listing yet.");
    const { error } = await supabase.rpc("admin_review_listing", { p_listing: listing.id, p_decision: decision, p_message: message || null });
    if (error) return fail(dbErrorMessage(error));
    const { data: v } = await supabase.from("vehicles").select("vehicle_status").eq("id", vehicleId).single();
    const seller = await sellerProfileFor(vehicleId);
    if (decision === "reject") {
      await supabase.rpc("transition_vehicle_status", { p_vehicle: vehicleId, p_new_status: "rejected", p_reason: message });
      if (seller.profileId) await notify(seller.profileId, "listing_update", "Your listing was not approved", message, `/dashboard/vehicles/${vehicleId}`);
    } else if (decision === "request_information") {
      if (v && ["submitted", "verification_pending", "valuation_completed", "awaiting_seller_approval", "rejected"].includes(v.vehicle_status)) {
        await supabase.rpc("transition_vehicle_status", { p_vehicle: vehicleId, p_new_status: "awaiting_information", p_reason: message });
      }
      if (seller.profileId) await notify(seller.profileId, "information_requested", "Meridian needs more information", message, `/dashboard/vehicles/${vehicleId}`);
    } else if (seller.profileId) {
      await notify(seller.profileId, "listing_approved", "Your vehicle listing is approved", `Meridian has approved the listing for your ${seller.name}.`, `/dashboard/vehicles/${vehicleId}`);
    }
    revalidatePath("/admin", "layout");
    return ok(undefined, decision === "approve" ? "Listing approved by Meridian." : "Decision recorded and seller notified.");
  });
}

export async function addInternalNote(vehicleId: string, note: string): Promise<ActionResult> {
  return guard(async () => {
    const { supabase, session } = await staff();
    if (!note.trim()) return fail("Write a note first.");
    const { error } = await supabase.from("vehicle_internal_notes").insert({ vehicle_id: vehicleId, author_id: session.userId, note: note.trim().slice(0, 4000) });
    if (error) return fail(dbErrorMessage(error));
    revalidatePath(`/admin/inventory/${vehicleId}`);
    return ok();
  });
}

export async function flagVehicle(vehicleId: string, reason: string | null): Promise<ActionResult> {
  return guard(async () => {
    const { supabase } = await staff();
    const { error } = await supabase.from("vehicles").update({ is_flagged: !!reason, flag_reason: reason }).eq("id", vehicleId);
    if (error) return fail(dbErrorMessage(error));
    revalidatePath(`/admin/inventory/${vehicleId}`);
    return ok(undefined, reason ? "Vehicle flagged." : "Flag removed.");
  });
}

export async function archiveVehicle(vehicleId: string, archive: boolean): Promise<ActionResult> {
  return guard(async () => {
    const { supabase } = await staff(["admin"]);
    const { error } = await supabase.from("vehicles").update({ archived_at: archive ? new Date().toISOString() : null }).eq("id", vehicleId);
    if (error) return fail(dbErrorMessage(error));
    if (archive) await supabase.from("listings").update({ listing_status: "archived" }).eq("vehicle_id", vehicleId).is("deleted_at", null).neq("listing_status", "sold");
    revalidatePath("/admin", "layout");
    return ok(undefined, archive ? "Archived." : "Restored.");
  });
}

export async function recordVerification(vehicleId: string, type: string, status: "verified" | "rejected" | "pending", publicSummary: string, notes: string): Promise<ActionResult> {
  return guard(async () => {
    const { supabase } = await staff(["verification_operator"]);
    const { error } = await supabase.from("vehicle_verifications").upsert({ vehicle_id: vehicleId, verification_type: type, status, public_summary: publicSummary || null, notes: notes || null,
      verified_by: null, verified_at: null }, { onConflict: "vehicle_id,verification_type" });
    if (error) return fail(dbErrorMessage(error));
    revalidatePath(`/admin/inventory/${vehicleId}`);
    return ok(undefined, "Verification recorded.");
  });
}

export async function setCheckPublic(checkId: string, isPublic: boolean): Promise<ActionResult> {
  return guard(async () => {
    const { supabase } = await staff(["verification_operator"]);
    const { data, error } = await supabase.from("vehicle_checks").update({ is_public: isPublic }).eq("id", checkId).select("vehicle_id").single();
    if (error) return fail(dbErrorMessage(error));
    revalidatePath(`/admin/inventory/${data.vehicle_id}`);
    return ok();
  });
}

export async function staffRunValuation(vehicleId: string): Promise<ActionResult> {
  return guard(async () => {
    const { session } = await staff(["sales_operator"]);
    try { const r = await runValuation(vehicleId, session.userId); revalidatePath(`/admin/inventory/${vehicleId}`); return ok(undefined, r.result.status === "completed" ? "Valuation completed." : "Insufficient market evidence — no valuation produced."); }
    catch (e) { return fail((e as Error).message); }
  });
}

export async function staffGenerateDraft(vehicleId: string): Promise<ActionResult> {
  return guard(async () => {
    const { session } = await staff(["sales_operator"]);
    const { data } = await createAdminClient().from("vehicles").select("*").eq("id", vehicleId).single();
    const r = await createAiDraft(vehicleId, data as Vehicle, session.userId);
    revalidatePath(`/admin/inventory/${vehicleId}`);
    return r;
  });
}

export async function staffDecideDraft(draftId: string, approve: boolean, vehicleId: string): Promise<ActionResult> {
  return guard(async () => {
    const { supabase } = await staff(["sales_operator"]);
    const { error } = approve ? await supabase.rpc("approve_listing_draft", { p_draft: draftId }) : await supabase.rpc("reject_listing_draft", { p_draft: draftId });
    if (error) return fail(dbErrorMessage(error));
    if (approve) {
      const seller = await sellerProfileFor(vehicleId);
      if (seller.profileId) await notify(seller.profileId, "listing_update", "Please review your updated listing", "Meridian has updated your listing description. Please review and approve it.", `/dashboard/vehicles/${vehicleId}`);
    }
    revalidatePath(`/admin/inventory/${vehicleId}`);
    return ok(undefined, approve ? "Draft applied. The seller must re-approve the listing." : "Draft rejected.");
  });
}

export async function staffEditListing(vehicleId: string, title: string, description: string, highlights: string): Promise<ActionResult> {
  return guard(async () => {
    const { supabase } = await staff(["sales_operator"]);
    const p = z.object({ title: z.string().trim().min(5).max(140), description: z.string().trim().min(20).max(6000) }).safeParse({ title, description });
    if (!p.success) return fail("Title 5–140 characters; description 20–6,000 characters.");
    const { error } = await supabase.from("listings").update({ title: p.data.title, description: p.data.description, description_source: "staff",
      highlights: highlights.split("\n").map((h) => h.trim()).filter(Boolean).slice(0, 8) }).eq("vehicle_id", vehicleId).is("deleted_at", null);
    if (error) return fail(dbErrorMessage(error));
    revalidatePath(`/admin/inventory/${vehicleId}`);
    return ok(undefined, "Listing updated. The seller will need to re-approve it.");
  });
}

export async function toggleFeatured(vehicleId: string, featured: boolean): Promise<ActionResult> {
  return guard(async () => {
    const { supabase } = await staff(["sales_operator"]);
    const { error } = await supabase.from("listings").update({ featured }).eq("vehicle_id", vehicleId).is("deleted_at", null);
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/admin", "layout"); revalidatePath("/");
    return ok();
  });
}

export async function proposePrice(vehicleId: string, price: number, explanation: string): Promise<ActionResult> {
  return guard(async () => {
    const { supabase } = await staff(["sales_operator"]);
    if (!Number.isInteger(price) || price < 100) return fail("Enter a valid price.");
    const { data: terms } = await supabase.from("vehicle_sale_terms").select("minimum_authorised_price").eq("vehicle_id", vehicleId).maybeSingle();
    if (terms?.minimum_authorised_price && price < terms.minimum_authorised_price) return fail(`This is below the seller's authorised minimum (£${terms.minimum_authorised_price.toLocaleString("en-GB")}).`);
    const { error } = await supabase.from("price_recommendations").insert({ vehicle_id: vehicleId, recommended_price: price, recommendation_type: "price_review", explanation: explanation || "Price review suggested by Meridian" });
    if (error) return fail(dbErrorMessage(error));
    const seller = await sellerProfileFor(vehicleId);
    if (seller.profileId) await notify(seller.profileId, "listing_update", "Price review suggestion", `Meridian suggests reviewing the price of your ${seller.name} to £${price.toLocaleString("en-GB")}. Nothing changes unless you accept.`, `/dashboard/vehicles/${vehicleId}#pricing`);
    revalidatePath(`/admin/inventory/${vehicleId}`);
    return ok(undefined, "Suggestion sent to the seller for approval.");
  });
}

export async function staffEnrich(vehicleId: string): Promise<ActionResult<{ summary: string }>> {
  return guard(async () => {
    const { session } = await staff();
    const admin = createAdminClient();
    const { data: v } = await admin.from("vehicles").select("*").eq("id", vehicleId).single();
    const res = await aiEnrichVehicle(v as Vehicle, (v?.submission_data as { dvla?: unknown })?.dvla, session.userId);
    if (!res.ok) return fail(res.message);
    await admin.from("vehicle_internal_notes").insert({ vehicle_id: vehicleId, author_id: session.userId,
      note: `AI submission review (requires human confirmation):\n${res.data.summary}\n\nMissing: ${res.data.missing_information.map((m) => m.field).join(", ") || "none"}\nInconsistencies: ${res.data.inconsistencies.map((i) => `${i.issue} (${i.severity})`).join("; ") || "none"}\nSuggestions: ${res.data.suggested_corrections.map((s) => `${s.field}: ${s.suggestion} [${s.basis}]`).join("; ") || "none"}` });
    revalidatePath(`/admin/inventory/${vehicleId}`);
    return ok({ summary: res.data.summary }, "AI review added to internal notes.");
  });
}

const manualSchema = z.object({
  make: z.string().trim().min(1).max(40), model: z.string().trim().min(1).max(60), derivative: z.string().trim().max(120).optional(),
  year: z.coerce.number().int().min(1950).max(new Date().getFullYear() + 1), mileage: z.coerce.number().int().min(0).max(1_500_000),
  fuel_type: z.enum(["petrol", "diesel", "hybrid", "plug_in_hybrid", "electric", "lpg", "other"]), transmission: z.enum(["manual", "automatic", "semi_automatic"]),
  body_type: z.enum(["hatchback", "saloon", "estate", "suv", "coupe", "convertible", "mpv", "pickup", "van", "other"]),
  registration_number: z.string().trim().toUpperCase().transform((s) => s.replace(/[^A-Z0-9]/g, "") || null).nullable().optional(),
  colour: z.string().trim().max(40).optional(), postcode: z.string().trim().toUpperCase().regex(/^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$/, "Valid UK postcode required"),
  location: z.string().trim().min(2).max(80), seller_email: z.union([z.email(), z.literal("")]).optional(),
});

export async function createManualVehicle(_: unknown, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const { supabase, session } = await staff(["sales_operator"]);
    const p = manualSchema.safeParse(Object.fromEntries(formData));
    if (!p.success) return fail("Please check the highlighted fields.", zodFieldErrors(p.error.issues));
    const { seller_email, ...d } = p.data;
    let ownerId: string | null = null;
    if (seller_email) {
      const admin = createAdminClient();
      const { data: prof } = await admin.from("profiles").select("id").eq("email", seller_email).maybeSingle();
      if (!prof) return fail("No account exists with that seller email.", { seller_email: "Account not found" });
      const { data: seller } = await admin.from("sellers").upsert({ profile_id: prof.id }, { onConflict: "profile_id" }).select("id").single();
      ownerId = seller?.id ?? null;
    }
    const { data, error } = await supabase.from("vehicles").insert({ ...d, owner_id: ownerId, source: "admin_manual", vehicle_status: "draft", submission_step: 8, created_by: session.userId }).select("id").single();
    if (error) return fail(dbErrorMessage(error));
    redirect(`/admin/inventory/${data.id}`);
  });
}

const coreSchema = z.object({
  make: z.string().trim().min(1).max(40), model: z.string().trim().min(1).max(60), derivative: z.string().trim().max(120).nullable(),
  year: z.coerce.number().int().min(1950).max(2100), mileage: z.coerce.number().int().min(0).max(1_500_000), colour: z.string().trim().max(40).nullable(),
  registration_number: z.string().trim().toUpperCase().nullable(), mot_expiry: z.string().nullable(), mot_source: z.enum(["seller", "dvla", "mot_history_api"]).nullable(),
});
export async function staffUpdateVehicle(vehicleId: string, values: Record<string, unknown>): Promise<ActionResult> {
  return guard(async () => {
    const { supabase } = await staff(["sales_operator", "verification_operator"]);
    const clean = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === "" ? null : v]));
    const p = coreSchema.safeParse(clean);
    if (!p.success) return fail("Please check the values.", zodFieldErrors(p.error.issues));
    const { error } = await supabase.from("vehicles").update(p.data).eq("id", vehicleId);
    if (error) return fail(dbErrorMessage(error));
    revalidatePath(`/admin/inventory/${vehicleId}`);
    return ok(undefined, "Vehicle updated (recorded in the audit log).");
  });
}

// ---------------------------------------------------------------------------
// Enquiries & CRM
// ---------------------------------------------------------------------------
export async function updateEnquiry(enquiryId: string, patch: { enquiry_status?: string; assigned_to?: string | null; priority?: string; follow_up_at?: string | null }): Promise<ActionResult> {
  return guard(async () => {
    const { supabase, session } = await staff();
    const { error } = await supabase.from("enquiries").update(patch).eq("id", enquiryId);
    if (error) return fail(dbErrorMessage(error));
    const note = Object.entries(patch).map(([k, v]) => `${k.replace("_", " ")} → ${v ?? "none"}`).join(", ");
    await supabase.from("enquiry_activities").insert({ enquiry_id: enquiryId, activity_type: patch.assigned_to !== undefined ? "assignment" : "status_change", note, author_id: session.userId });
    revalidatePath(`/admin/enquiries/${enquiryId}`); revalidatePath("/admin/enquiries");
    return ok();
  });
}

export async function addEnquiryActivity(enquiryId: string, type: "call_note" | "email_note" | "follow_up" | "reminder", note: string, dueAt: string | null): Promise<ActionResult> {
  return guard(async () => {
    const { supabase, session } = await staff();
    if (!note.trim()) return fail("Add a note.");
    const { error } = await supabase.from("enquiry_activities").insert({ enquiry_id: enquiryId, activity_type: type, note: note.trim(), due_at: dueAt || null, author_id: session.userId });
    if (error) return fail(dbErrorMessage(error));
    if (dueAt) await supabase.from("enquiries").update({ follow_up_at: dueAt }).eq("id", enquiryId);
    revalidatePath(`/admin/enquiries/${enquiryId}`);
    return ok();
  });
}

export async function completeActivity(activityId: string, enquiryId: string): Promise<ActionResult> {
  return guard(async () => {
    const { supabase } = await staff();
    const { error } = await supabase.from("enquiry_activities").update({ completed_at: new Date().toISOString() }).eq("id", activityId);
    if (error) return fail(dbErrorMessage(error));
    revalidatePath(`/admin/enquiries/${enquiryId}`);
    return ok();
  });
}

export async function analyseEnquiry(enquiryId: string): Promise<ActionResult> {
  return guard(async () => {
    const { supabase, session } = await staff();
    const { data: e } = await supabase.from("enquiries").select("*, listings(title, asking_price), vehicles(*)").eq("id", enquiryId).single();
    if (!e) return fail("Enquiry not found");
    const v = (Array.isArray(e.vehicles) ? e.vehicles[0] : e.vehicles) as Vehicle;
    const l = (Array.isArray(e.listings) ? e.listings[0] : e.listings) as { title: string; asking_price: number };
    const res = await aiAnalyseEnquiry({ enquiryType: e.enquiry_type, message: e.message, offer: e.offer_amount,
      listing: { title: l?.title, asking_price: l?.asking_price, make: v.make, model: v.model, year: v.year, mileage: v.mileage, service_history: v.service_history,
        mot_expiry: v.mot_expiry, disclosures: { damage: v.cosmetic_damage, mechanical: v.mechanical_issues, accidents: v.accident_history, finance: v.has_outstanding_finance } } }, session.userId, v.id);
    if (!res.ok) return fail(res.message);
    const a = res.data;
    await supabase.from("enquiries").update({ ai_category: a.category, ai_summary: `${a.recommended_next_action}\n\nRequirements: ${a.stated_requirements.join("; ") || "—"}\nQuestions: ${a.questions_to_answer.join("; ") || "—"}\nSuggested priority: ${a.priority} (${a.priority_reason})` }).eq("id", enquiryId);
    await supabase.from("enquiry_activities").insert({ enquiry_id: enquiryId, activity_type: "ai_analysis", note: `Suggested response (review before sending):\n${a.suggested_response}`, metadata: a, author_id: session.userId });
    revalidatePath(`/admin/enquiries/${enquiryId}`);
    return ok(undefined, "AI analysis added. Review before acting — nothing has been sent.");
  });
}

export async function scheduleViewing(enquiryId: string, when: string, note: string): Promise<ActionResult> {
  return guard(async () => {
    const { supabase, session } = await staff(["sales_operator"]);
    const { data: e } = await supabase.from("enquiries").select("vehicle_id, buyer_id, buyers(profile_id), sellers(profile_id)").eq("id", enquiryId).single();
    if (!e || !when) return fail("Choose a date and time.");
    const { error } = await supabase.from("viewings").insert({ enquiry_id: enquiryId, vehicle_id: e.vehicle_id, scheduled_for: new Date(when).toISOString(), location_note: note || null, created_by: session.userId });
    if (error) return fail(dbErrorMessage(error));
    await supabase.from("enquiries").update({ enquiry_status: "viewing_arranged" }).eq("id", enquiryId);
    const { data: v } = await supabase.from("vehicles").select("vehicle_status").eq("id", e.vehicle_id).single();
    if (v && ["published", "receiving_enquiries"].includes(v.vehicle_status)) await supabase.rpc("transition_vehicle_status", { p_vehicle: e.vehicle_id, p_new_status: "viewing_arranged", p_reason: "Viewing arranged" });
    const when2 = new Date(when).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" });
    for (const rel of [e.buyers, e.sellers]) {
      const pid = ((Array.isArray(rel) ? rel[0] : rel) as { profile_id: string } | null)?.profile_id;
      if (pid) await notify(pid, "viewing_update", "Viewing arranged", `A viewing has been proposed for ${when2}.${note ? ` ${note}` : ""}`, "/dashboard");
    }
    revalidatePath(`/admin/enquiries/${enquiryId}`);
    return ok(undefined, "Viewing scheduled and both parties notified.");
  });
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------
export async function staffRecordSale(vehicleId: string, price: number): Promise<ActionResult> {
  return guard(async () => {
    const { supabase } = await staff(["sales_operator"]);
    const { data: v } = await supabase.from("vehicles").select("owner_id").eq("id", vehicleId).single();
    if (!v?.owner_id) return fail("This vehicle has no seller account.");
    const { data: listing } = await supabase.from("listings").select("id").eq("vehicle_id", vehicleId).is("deleted_at", null).maybeSingle();
    const { error } = await supabase.from("transactions").insert({ vehicle_id: vehicleId, listing_id: listing?.id, seller_id: v.owner_id, agreed_price: price, sale_status: "agreed" });
    if (error) return fail(dbErrorMessage(error));
    const seller = await sellerProfileFor(vehicleId);
    if (seller.profileId) await notify(seller.profileId, "listing_update", "Please confirm your sale", `Meridian has recorded an agreed sale of your ${seller.name} at £${price.toLocaleString("en-GB")}. Please confirm it from your vehicle page using 'Report a sale'.`, `/dashboard/vehicles/${vehicleId}`);
    revalidatePath("/admin/sales");
    return ok(undefined, "Sale recorded. The seller has been asked to confirm.");
  });
}

export async function completeSale(transactionId: string): Promise<ActionResult> {
  return guard(async () => {
    const { supabase } = await staff(["sales_operator"]);
    const { data: tx, error } = await supabase.rpc("staff_complete_sale", { p_transaction: transactionId });
    if (error) return fail(dbErrorMessage(error));
    const t = tx as { vehicle_id: string; fee_amount: number };
    const seller = await sellerProfileFor(t.vehicle_id);
    if (seller.profileId) {
      await notify(seller.profileId, "vehicle_sold", "Your vehicle has been marked as sold", `Congratulations — the sale of your ${seller.name} is complete.`, `/dashboard/sales`);
      if (t.fee_amount > 0) await notify(seller.profileId, "payment_due", "Your Meridian success fee", `A success fee of £${t.fee_amount} is now payable.`, "/dashboard/payments");
    }
    revalidatePath("/admin", "layout");
    return ok(undefined, "Sale completed and fee raised.");
  });
}

export async function markSaleFellThrough(transactionId: string): Promise<ActionResult> {
  return guard(async () => {
    const { supabase } = await staff(["sales_operator"]);
    const { error } = await supabase.from("transactions").update({ sale_status: "fell_through" }).eq("id", transactionId).neq("sale_status", "completed");
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/admin/sales");
    return ok();
  });
}

// ---------------------------------------------------------------------------
// Users, settings, services, payments
// ---------------------------------------------------------------------------
export async function changeRole(profileId: string, role: AppRole): Promise<ActionResult> {
  return guard(async () => {
    const { supabase } = await staff(["admin"]);
    const { error } = await supabase.from("profiles").update({ role }).eq("id", profileId);
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/admin/users");
    return ok(undefined, "Role updated.");
  });
}

export async function setAccountStatus(profileId: string, status: "active" | "suspended"): Promise<ActionResult> {
  return guard(async () => {
    const { supabase, session } = await staff(["admin"]);
    if (profileId === session.userId) return fail("You cannot change your own account status.");
    const { error } = await supabase.from("profiles").update({ account_status: status }).eq("id", profileId);
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/admin/users");
    return ok();
  });
}

export async function updateDataRequest(id: string, status: string, notes: string): Promise<ActionResult> {
  return guard(async () => {
    const { supabase, session } = await staff(["admin"]);
    const { error } = await supabase.from("data_requests").update({ request_status: status, resolution_notes: notes || null, handled_by: session.userId,
      completed_at: ["completed", "refused"].includes(status) ? new Date().toISOString() : null }).eq("id", id);
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/admin/users");
    return ok();
  });
}

const SETTING_VALIDATORS: Record<string, (v: unknown) => string | null> = {
  "fees.sale_fee_tiers": (v) => (Array.isArray(v) ? validateFeeTiers(v as FeeTier[]) : "Must be a list of tiers"),
  "matching.weights": (v) => {
    if (!v || typeof v !== "object") return "Must be an object";
    const vals = Object.values(v as Record<string, number>);
    if (vals.some((x) => typeof x !== "number" || x < 0)) return "Weights must be non-negative numbers";
    return Math.abs(vals.reduce((a, b) => a + b, 0) - 1) > 0.001 ? "Weights must sum to 1" : null;
  },
  "pricing.min_comparables": (v) => (Number.isInteger(v) && (v as number) >= 3 ? null : "Must be a whole number of at least 3"),
  "ai.enabled": (v) => (typeof v === "boolean" ? null : "Must be true or false"),
};

export async function updateSetting(key: string, raw: string): Promise<ActionResult> {
  return guard(async () => {
    const { supabase, session } = await staff(["admin"]);
    let value: unknown;
    try { value = JSON.parse(raw); } catch { return fail("Value must be valid JSON."); }
    const err = SETTING_VALIDATORS[key]?.(value) ?? null;
    if (err) return fail(err);
    const { error } = await supabase.from("platform_settings").update({ setting_value: value, updated_by: session.userId }).eq("setting_key", key);
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/admin/settings"); revalidatePath("/sell");
    return ok(undefined, "Setting saved.");
  });
}

export async function upsertService(_: unknown, formData: FormData): Promise<ActionResult> {
  return guard(async () => {
    const { supabase } = await staff(["admin"]);
    const p = z.object({ id: z.string().optional(), code: z.string().regex(/^[a-z0-9_]+$/), name: z.string().min(2).max(80), description: z.string().min(5).max(500),
      price: z.coerce.number().int().min(0).max(100000), is_active: z.preprocess((v) => v === "on", z.boolean()) }).safeParse(Object.fromEntries(formData));
    if (!p.success) return fail("Please check the fields.", zodFieldErrors(p.error.issues));
    const { id, ...d } = p.data;
    const { error } = id ? await supabase.from("service_catalog").update(d).eq("id", id) : await supabase.from("service_catalog").insert(d);
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/admin/services");
    return ok(undefined, "Service saved.");
  });
}

export async function updateServiceOrder(orderId: string, status: string, staffNotes: string, requestPayment: boolean): Promise<ActionResult> {
  return guard(async () => {
    const { supabase } = await staff(["sales_operator"]);
    const { data: order, error } = await supabase.from("service_orders").update({ service_status: status, staff_notes: staffNotes || null }).eq("id", orderId).select("*, sellers(profile_id)").single();
    if (error) return fail(dbErrorMessage(error));
    const profileId = ((Array.isArray(order.sellers) ? order.sellers[0] : order.sellers) as { profile_id: string }).profile_id;
    if (requestPayment && order.price > 0) {
      const { error: pErr } = await createAdminClient().from("payments").insert({ service_order_id: orderId, profile_id: profileId, amount: order.price * 100, currency: "gbp", payment_status: "pending", payment_type: "service", description: `Meridian service: ${order.service_type.replace(/_/g, " ")}` });
      if (pErr) return fail(dbErrorMessage(pErr));
      await notify(profileId, "payment_due", "Payment requested", "A payment has been requested for your Meridian service.", "/dashboard/payments");
    }
    revalidatePath("/admin/services");
    return ok();
  });
}

export async function decideRefund(requestId: string, approve: boolean): Promise<ActionResult> {
  return guard(async () => {
    const { supabase, session } = await staff(["admin"]);
    const { data: r } = await supabase.from("refund_requests").select("*, payments(stripe_payment_id, amount, refunded_amount)").eq("id", requestId).single();
    if (!r || r.request_status !== "requested") return fail("Refund request not found");
    if (!approve) {
      await supabase.from("refund_requests").update({ request_status: "rejected", decided_by: session.userId, decided_at: new Date().toISOString() }).eq("id", requestId);
      revalidatePath("/admin/payments"); return ok();
    }
    const p = (Array.isArray(r.payments) ? r.payments[0] : r.payments) as { stripe_payment_id: string | null; amount: number; refunded_amount: number };
    const stripe = getStripe();
    if (!stripe || !p.stripe_payment_id) return fail("Stripe is not configured or this payment has no Stripe reference.");
    if (r.amount > p.amount - p.refunded_amount) return fail("Refund exceeds the remaining amount.");
    const refund = await stripe.refunds.create({ payment_intent: p.stripe_payment_id, amount: r.amount, metadata: { refund_request_id: requestId } }, { idempotencyKey: `refund-${requestId}` });
    // Payment status itself is updated by the verified charge.refunded webhook.
    await supabase.from("refund_requests").update({ request_status: "approved", stripe_refund_id: refund.id, decided_by: session.userId, decided_at: new Date().toISOString() }).eq("id", requestId);
    revalidatePath("/admin/payments");
    return ok(undefined, "Refund submitted to Stripe. Status updates when Stripe confirms.");
  });
}

export async function toggleProvider(id: string, enabled: boolean): Promise<ActionResult> {
  return guard(async () => {
    const { supabase } = await staff(["admin"]);
    const { error } = await supabase.from("data_providers").update({ is_enabled: enabled }).eq("id", id);
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/admin/pricing");
    return ok();
  });
}

export async function resolveContact(id: string, status: "in_progress" | "resolved" | "spam"): Promise<ActionResult> {
  return guard(async () => {
    const { supabase, session } = await staff();
    const { error } = await supabase.from("contact_messages").update({ status, handled_by: session.userId }).eq("id", id);
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/admin/enquiries");
    return ok();
  });
}

export async function respondAssistance(id: string, response: string, status: "in_progress" | "resolved"): Promise<ActionResult> {
  return guard(async () => {
    const { supabase, session } = await staff();
    const { data, error } = await supabase.from("assistance_requests").update({ response: response || null, status, handled_by: session.userId }).eq("id", id).select("sellers(profile_id)").single();
    if (error) return fail(dbErrorMessage(error));
    const pid = ((Array.isArray(data.sellers) ? data.sellers[0] : data.sellers) as { profile_id: string } | null)?.profile_id;
    if (pid && response) await notify(pid, "listing_update", "Reply from Meridian", response.slice(0, 500), "/dashboard");
    revalidatePath("/admin/sellers");
    return ok();
  });
}

export async function staffCreateListing(vehicleId: string, price: number): Promise<ActionResult> {
  return guard(async () => {
    const { supabase } = await staff(["sales_operator"]);
    if (!Number.isInteger(price) || price < 100) return fail("Enter a valid asking price.");
    const { data: v } = await supabase.from("vehicles").select("year, make, model, derivative, description, location").eq("id", vehicleId).single();
    if (!v) return fail("Vehicle not found");
    const { error } = await supabase.from("listings").insert({ vehicle_id: vehicleId, title: [v.year, v.make, v.model, v.derivative].filter(Boolean).join(" "), description: v.description, asking_price: price, location: v.location });
    if (error) return fail(dbErrorMessage(error));
    revalidatePath(`/admin/inventory/${vehicleId}`);
    return ok(undefined, "Listing created.");
  });
}

/** For Meridian-managed stock with no seller account: record the owner's written authorisation. */
export async function staffConfirmStockApproval(vehicleId: string): Promise<ActionResult> {
  return guard(async () => {
    const { supabase, session } = await staff(["sales_operator"]);
    const { error } = await supabase.from("listings").update({ seller_approved_at: new Date().toISOString(), seller_approved_by: session.userId }).eq("vehicle_id", vehicleId).is("deleted_at", null);
    if (error) return fail(dbErrorMessage(error));
    await supabase.from("vehicle_internal_notes").insert({ vehicle_id: vehicleId, author_id: session.userId, note: "Owner authorisation for listing content and price confirmed by staff (managed stock)." });
    revalidatePath(`/admin/inventory/${vehicleId}`);
    return ok(undefined, "Owner authorisation recorded.");
  });
}
