import { z } from "zod";

/** Every AI output is validated against one of these schemas before use. */

export const searchParseSchema = z.object({
  make: z.string().nullable(),
  model: z.string().nullable(),
  min_price: z.number().int().nullable(),
  max_price: z.number().int().nullable(),
  min_year: z.number().int().nullable(),
  max_year: z.number().int().nullable(),
  max_mileage: z.number().int().nullable(),
  fuel: z.array(z.enum(["petrol", "diesel", "hybrid", "plug_in_hybrid", "electric", "lpg", "other"])),
  transmission: z.array(z.enum(["manual", "automatic", "semi_automatic"])),
  body: z.array(z.enum(["hatchback", "saloon", "estate", "suv", "coupe", "convertible", "mpv", "pickup", "van", "other"])),
  location: z.string().nullable(),
  keywords: z.string().nullable().describe("Remaining descriptive words useful for keyword ranking, or null"),
  interpretation: z.array(z.string()).describe("Short human-readable list of how the request was interpreted"),
  unsupported: z.array(z.string()).describe("Parts of the request that cannot be expressed as marketplace filters"),
});
export type SearchParse = z.infer<typeof searchParseSchema>;

export const listingGenerationSchema = z.object({
  title: z.string().min(5).max(140),
  short_description: z.string().max(300),
  description: z.string().min(40).max(5000),
  highlights: z.array(z.string().max(120)).max(8),
  search_tags: z.array(z.string().max(40)).max(15),
  facts_used: z.array(z.string()).describe("Every factual claim used, each traceable to a provided field"),
});
export type ListingGeneration = z.infer<typeof listingGenerationSchema>;

export const enrichmentSchema = z.object({
  missing_information: z.array(z.object({ field: z.string(), why_it_matters: z.string() })),
  inconsistencies: z.array(z.object({ fields: z.array(z.string()), issue: z.string(), severity: z.enum(["low", "medium", "high"]) })),
  suggested_corrections: z.array(z.object({ field: z.string(), current_value: z.string().nullable(), suggestion: z.string(), basis: z.string(), requires_confirmation: z.literal(true) })),
  suggested_body_type: z.enum(["hatchback", "saloon", "estate", "suv", "coupe", "convertible", "mpv", "pickup", "van", "other"]).nullable(),
  suggested_categories: z.array(z.string()),
  summary: z.string(),
});
export type Enrichment = z.infer<typeof enrichmentSchema>;

export const valuationExplanationSchema = z.object({
  explanation: z.string().max(1500),
  trade_off: z.string().max(600),
});

export const enquiryAnalysisSchema = z.object({
  category: z.enum(["viewing", "price_negotiation", "vehicle_history", "condition", "finance", "part_exchange", "availability", "offer", "general", "possible_spam"]),
  stated_requirements: z.array(z.string()),
  questions_to_answer: z.array(z.string()),
  suggested_response: z.string().max(1500),
  recommended_next_action: z.string().max(300),
  priority: z.enum(["low", "normal", "high"]),
  priority_reason: z.string().describe("Must cite the buyer's explicit words, never assumptions about the person"),
});
export type EnquiryAnalysis = z.infer<typeof enquiryAnalysisSchema>;

export const marketIntelligenceSchema = z.object({
  summary: z.string().max(800),
  suggestions: z.array(z.object({
    type: z.enum(["price_review", "photographs", "description", "specification", "buyer_matches", "no_action"]),
    suggestion: z.string().max(400),
    evidence: z.string().max(300),
  })).max(6),
});
export type MarketIntelligence = z.infer<typeof marketIntelligenceSchema>;

export const documentExtractionSchema = z.object({
  document_kind: z.enum(["v5c", "service_record", "mot_certificate", "invoice", "other", "unreadable"]),
  extracted_fields: z.array(z.object({ field: z.string(), value: z.string(), confidence: z.enum(["low", "medium", "high"]) })),
  notes: z.string(),
});
