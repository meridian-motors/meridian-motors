"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { enquirySchema } from "@/lib/validation/public";
import { fail, ok, zodFieldErrors, dbErrorMessage, type ActionResult } from "@/lib/action-result";
import { clientKey } from "@/lib/rate-limit";
import { deliverQueued } from "@/lib/notifications";
import { geocodeOutcode } from "@/lib/geo";
import { z } from "zod";

export async function toggleSavedVehicle(vehicleId: string): Promise<ActionResult<{ saved: boolean }>> {
  const session = await getSession();
  if (!session) return fail("Please sign in to save vehicles.");
  if (!z.uuid().safeParse(vehicleId).success) return fail("Invalid vehicle");
  const supabase = await createClient();
  const { data: buyerId, error: bErr } = await supabase.rpc("ensure_buyer");
  if (bErr) return fail(dbErrorMessage(bErr));
  const { data: existing } = await supabase.from("saved_vehicles").select("id").eq("vehicle_id", vehicleId).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("saved_vehicles").delete().eq("id", existing.id);
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/dashboard/saved");
    return ok({ saved: false });
  }
  const { error } = await supabase.from("saved_vehicles").insert({ buyer_id: buyerId, vehicle_id: vehicleId });
  if (error) return fail(error.code === "42501" ? "This vehicle is no longer available." : dbErrorMessage(error));
  revalidatePath("/dashboard/saved");
  return ok({ saved: true });
}

export async function submitEnquiry(_: unknown, formData: FormData): Promise<ActionResult<{ enquiryId: string }>> {
  const raw = Object.fromEntries(formData);
  const parsed = enquirySchema.safeParse({ ...raw, consent: raw.consent === "on", offerAmount: raw.offerAmount ? raw.offerAmount : undefined });
  if (!parsed.success) return fail("Please check the highlighted fields.", zodFieldErrors(parsed.error.issues));
  const d = parsed.data;
  if (d.website) return ok(); // honeypot: silently accept
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_enquiry", {
    p_listing: d.listingId, p_type: d.enquiryType, p_message: d.message, p_full_name: d.fullName, p_email: d.email,
    p_phone: d.phone || null, p_offer: d.offerAmount ?? null, p_client_key: await clientKey(),
  });
  if (error) return fail(dbErrorMessage(error, "We couldn't send your enquiry. Please try again."));
  await deliverQueued(10).catch(() => undefined);
  return ok({ enquiryId: data as string }, "Your enquiry has been sent. We will be in touch shortly.");
}

export async function sendMessage(conversationId: string, message: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return fail("Please sign in.");
  const text = message.trim();
  if (text.length < 1 || text.length > 3000) return fail("Messages must be between 1 and 3,000 characters.");
  const supabase = await createClient();
  const { error } = await supabase.from("messages").insert({ conversation_id: conversationId, message: text, sender_role: "buyer" });
  if (error) return fail(dbErrorMessage(error));
  revalidatePath("/dashboard", "layout");
  return ok();
}

const prefsSchema = z.object({
  preferred_makes: z.array(z.string().trim().max(40)).max(10),
  preferred_models: z.array(z.string().trim().max(60)).max(10),
  minimum_budget: z.number().int().min(0).max(5_000_000).nullable(),
  maximum_budget: z.number().int().min(0).max(5_000_000).nullable(),
  maximum_mileage: z.number().int().min(0).max(1_500_000).nullable(),
  minimum_year: z.number().int().min(1950).max(2100).nullable(),
  preferred_fuel: z.array(z.enum(["petrol", "diesel", "hybrid", "plug_in_hybrid", "electric", "lpg", "other"])),
  preferred_transmission: z.array(z.enum(["manual", "automatic", "semi_automatic"])),
  preferred_body_type: z.array(z.enum(["hatchback", "saloon", "estate", "suv", "coupe", "convertible", "mpv", "pickup", "van", "other"])),
  desired_features: z.array(z.string().trim().max(40)).max(10),
  postcode: z.string().trim().toUpperCase().regex(/^[A-Z]{1,2}[0-9][A-Z0-9]?( ?[0-9][A-Z]{2})?$/, "Enter a valid UK postcode or district").nullable(),
  max_distance_miles: z.number().int().min(1).max(1000).nullable(),
  matching_opt_in: z.boolean(),
}).refine((d) => d.minimum_budget == null || d.maximum_budget == null || d.minimum_budget <= d.maximum_budget, { path: ["maximum_budget"], message: "Maximum must be above minimum" });

const list = (v: FormDataEntryValue | null) => String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const intOrNull = (v: FormDataEntryValue | null) => (v == null || String(v).trim() === "" ? null : Number(String(v).replace(/[,£\s]/g, "")));

export async function saveBuyerPreferences(_: unknown, formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return fail("Please sign in.");
  const parsed = prefsSchema.safeParse({
    preferred_makes: list(formData.get("preferred_makes")), preferred_models: list(formData.get("preferred_models")),
    minimum_budget: intOrNull(formData.get("minimum_budget")), maximum_budget: intOrNull(formData.get("maximum_budget")),
    maximum_mileage: intOrNull(formData.get("maximum_mileage")), minimum_year: intOrNull(formData.get("minimum_year")),
    preferred_fuel: formData.getAll("preferred_fuel"), preferred_transmission: formData.getAll("preferred_transmission"),
    preferred_body_type: formData.getAll("preferred_body_type"), desired_features: list(formData.get("desired_features")),
    postcode: String(formData.get("postcode") ?? "").trim() || null, max_distance_miles: intOrNull(formData.get("max_distance_miles")),
    matching_opt_in: formData.get("matching_opt_in") === "on",
  });
  if (!parsed.success) return fail("Please check the highlighted fields.", zodFieldErrors(parsed.error.issues));
  const supabase = await createClient();
  const { data: buyerId, error: bErr } = await supabase.rpc("ensure_buyer");
  if (bErr) return fail(dbErrorMessage(bErr));
  const { matching_opt_in, ...prefs } = parsed.data;
  const coords = prefs.postcode ? await geocodeOutcode(prefs.postcode) : null;
  const { error } = await supabase.from("buyer_preferences").upsert({ buyer_id: buyerId, ...prefs, location: prefs.postcode,
    latitude: coords?.lat ?? null, longitude: coords?.lng ?? null }, { onConflict: "buyer_id" });
  if (error) return fail(dbErrorMessage(error));
  await supabase.from("buyers").update({ matching_opt_in, minimum_budget: prefs.minimum_budget, maximum_budget: prefs.maximum_budget }).eq("id", buyerId);
  revalidatePath("/dashboard/preferences");
  revalidatePath("/dashboard/recommendations");
  return ok(undefined, "Preferences saved.");
}

export async function saveSearch(name: string, filters: Record<string, unknown>, alerts: boolean): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return fail("Please sign in to save searches.");
  const n = name.trim().slice(0, 80) || "My search";
  const supabase = await createClient();
  const { data: buyerId, error: bErr } = await supabase.rpc("ensure_buyer");
  if (bErr) return fail(dbErrorMessage(bErr));
  const { error } = await supabase.from("saved_searches").insert({ buyer_id: buyerId, name: n, filters, alerts_enabled: alerts });
  if (error) return fail(dbErrorMessage(error));
  revalidatePath("/dashboard/searches");
  return ok(undefined, "Search saved.");
}

export async function deleteSavedSearch(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("saved_searches").delete().eq("id", id);
  if (error) return fail(dbErrorMessage(error));
  revalidatePath("/dashboard/searches");
  return ok();
}

export async function toggleSearchAlerts(id: string, enabled: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("saved_searches").update({ alerts_enabled: enabled }).eq("id", id);
  if (error) return fail(dbErrorMessage(error));
  revalidatePath("/dashboard/searches");
  return ok();
}

export async function dismissMatch(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("buyer_matches").update({ dismissed_at: new Date().toISOString() }).eq("id", id);
  if (error) return fail(dbErrorMessage(error));
  revalidatePath("/dashboard/recommendations");
  return ok();
}
