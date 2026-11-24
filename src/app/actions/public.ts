"use server";
import { createAdminClient } from "@/lib/supabase/admin";
import { contactSchema } from "@/lib/validation/public";
import { fail, ok, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/auth";
import { aiParseSearch } from "@/lib/ai/tasks";
import { isAiConfigured } from "@/lib/ai/run";
import { parseNaturalQuery } from "@/lib/search/parse-natural";
import { filtersToQuery } from "@/lib/search/filters";
import { getFacets } from "@/lib/data/listings";
import { notifyStaff } from "@/lib/notifications";
import type { MarketplaceFilters } from "@/lib/types";

export async function submitContact(_: unknown, formData: FormData): Promise<ActionResult> {
  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Please check the highlighted fields.", zodFieldErrors(parsed.error.issues));
  if (parsed.data.website) return ok(undefined, "Thank you — your message has been sent.");
  if (!(await rateLimit(`contact:${await clientKey()}`, 5, 3600))) return fail("Too many messages. Please try again later.");
  const session = await getSession();
  const admin = createAdminClient();
  const { error } = await admin.from("contact_messages").insert({
    full_name: parsed.data.fullName, email: parsed.data.email, phone: parsed.data.phone || null, topic: parsed.data.topic,
    message: parsed.data.message, profile_id: session?.userId ?? null,
  });
  if (error) return fail("We couldn't send your message. Please email us instead.");
  if (parsed.data.topic === "data_protection" && session) {
    // GDPR requests are also logged in the statutory data request register.
    await admin.from("data_requests").insert({ profile_id: session.userId, email: parsed.data.email, request_type: "access", details: parsed.data.message });
  }
  await notifyStaff("contact_message", "New contact message", `${parsed.data.topic.replace("_", " ")} — ${parsed.data.fullName}`, "/admin/enquiries?tab=contact");
  return ok(undefined, "Thank you — your message has been sent. We aim to reply within one working day.");
}

export interface AiSearchResponse {
  ok: boolean;
  href: string;
  mode: "ai" | "rules";
  interpretation: string[];
  unsupported: string[];
  message?: string;
}

/**
 * Natural-language search → marketplace filters. The AI never returns vehicles;
 * it only produces filters that are then run against real, published listings.
 */
export async function naturalLanguageSearch(query: string): Promise<AiSearchResponse> {
  const q = query.trim().slice(0, 500);
  if (q.length < 3) return { ok: false, href: "/cars", mode: "rules", interpretation: [], unsupported: [], message: "Describe the car you are looking for." };
  if (!(await rateLimit(`ai-search:${await clientKey()}`, 30, 3600))) {
    const { filters, understood } = parseNaturalQuery(q);
    return { ok: true, href: `/cars?${filtersToQuery(filters)}`, mode: "rules", interpretation: understood, unsupported: [], message: "Using quick search." };
  }
  const facets = await getFacets();
  const makes = facets.makes.map((m) => m.make);
  const session = await getSession();

  if (isAiConfigured()) {
    const res = await aiParseSearch(q, session?.userId ?? null, makes);
    if (res.ok) {
      const d = res.data;
      const f: MarketplaceFilters = {
        make: d.make ?? undefined, model: d.model ?? undefined, minPrice: d.min_price ?? undefined, maxPrice: d.max_price ?? undefined,
        minYear: d.min_year ?? undefined, maxYear: d.max_year ?? undefined, maxMileage: d.max_mileage ?? undefined,
        fuel: d.fuel.length ? d.fuel : undefined, transmission: d.transmission.length ? d.transmission : undefined, body: d.body.length ? d.body : undefined,
        location: d.location ?? undefined, sort: "newest",
      };
      // Make must exist as an exact facet, otherwise fall back to keyword matching.
      if (f.make && !makes.some((m) => m.toLowerCase() === f.make!.toLowerCase())) { f.q = [f.make, f.model].filter(Boolean).join(" "); f.make = undefined; f.model = undefined; }
      return { ok: true, href: `/cars?${filtersToQuery(f)}&ai=1`, mode: "ai", interpretation: d.interpretation, unsupported: d.unsupported };
    }
  }
  const { filters, understood } = parseNaturalQuery(q, makes.length ? makes : undefined);
  return { ok: true, href: `/cars?${filtersToQuery(filters)}`, mode: "rules", interpretation: understood, unsupported: [] };
}
