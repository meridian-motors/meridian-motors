import "server-only";
import { runAiTask } from "./run";
import {
  enquiryAnalysisSchema, enrichmentSchema, listingGenerationSchema, marketIntelligenceSchema, searchParseSchema, valuationExplanationSchema,
} from "./schemas";
import type { Vehicle } from "@/lib/types";

/** Only seller-confirmed / verified facts. Private identifiers are never sent. */
export function vehicleFacts(v: Vehicle, extras?: { checks?: unknown[]; verifications?: unknown[] }) {
  return {
    make: v.make, model: v.model, derivative: v.derivative, year: v.year, mileage: v.mileage, fuel_type: v.fuel_type,
    transmission: v.transmission, body_type: v.body_type, engine_size_cc: v.engine_size, colour: v.colour, doors: v.doors, seats: v.seats,
    specification: v.specification, condition_seller_declared: v.condition,
    service_history: v.service_history, service_history_notes: v.service_history_notes,
    mot_expiry: v.mot_expiry, mot_expiry_source: v.mot_source ?? "seller-stated",
    previous_keepers: v.previous_keepers,
    disclosures: {
      cosmetic_damage: v.cosmetic_damage, mechanical_issues: v.mechanical_issues, accident_history: v.accident_history,
      outstanding_finance: v.has_outstanding_finance, modifications: v.modifications, other: v.other_disclosures,
    },
    seller_description: v.description,
    town: v.location,
    completed_checks: extras?.checks ?? [],
    staff_verifications: extras?.verifications ?? [],
  };
}

const wrap = (label: string, data: unknown) => `<${label}>\n${JSON.stringify(data, null, 2)}\n</${label}>`;

export function aiParseSearch(query: string, userId: string | null, knownMakes: string[]) {
  return runAiTask({
    task: "search_parse", prompt: "search_parse", schema: searchParseSchema, userId, effort: "low", maxTokens: 1500, cacheTtlHours: 24,
    inputSummary: query.slice(0, 200), dailyLimitOverride: 200,
    userContent: `Makes currently on the marketplace: ${knownMakes.join(", ") || "none"}\n\n<buyer_request>\n${query.slice(0, 500)}\n</buyer_request>`,
  });
}

export function aiGenerateListing(vehicle: Vehicle, extras: { checks: unknown[]; verifications: unknown[] }, userId: string) {
  return runAiTask({
    task: "listing_generation", prompt: "listing_generation", schema: listingGenerationSchema, userId, vehicleId: vehicle.id,
    effort: "medium", maxTokens: 6000,
    inputSummary: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
    userContent: `Write the listing using only these facts.\n${wrap("vehicle_facts", vehicleFacts(vehicle, extras))}`,
  });
}

export function aiEnrichVehicle(vehicle: Vehicle, dvla: unknown, userId: string) {
  return runAiTask({
    task: "vehicle_enrichment", prompt: "vehicle_enrichment", schema: enrichmentSchema, userId, vehicleId: vehicle.id, effort: "medium", maxTokens: 5000,
    inputSummary: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
    userContent: `${wrap("seller_submission", vehicleFacts(vehicle))}\n${wrap("dvla_vehicle_enquiry_data", dvla ?? "not available")}`,
  });
}

export function aiExplainValuation(input: {
  vehicle: string; marketMin: number; marketMax: number; asking: number; fastSale: number; confidence: number; comparableCount: number; limitations: string[];
}, userId: string | null, vehicleId: string) {
  return runAiTask({
    task: "valuation_explanation", prompt: "valuation_explanation", schema: valuationExplanationSchema, userId, vehicleId, effort: "low", maxTokens: 2000,
    inputSummary: input.vehicle, cacheTtlHours: 24 * 7,
    userContent: wrap("valuation", input),
  });
}

export function aiAnalyseEnquiry(input: { enquiryType: string; message: string; offer: number | null; listing: Record<string, unknown> }, userId: string, vehicleId: string) {
  return runAiTask({
    task: "enquiry_analysis", prompt: "enquiry_analysis", schema: enquiryAnalysisSchema, userId, vehicleId, effort: "low", maxTokens: 3000,
    inputSummary: `${input.enquiryType} enquiry`,
    userContent: `${wrap("listing_facts", input.listing)}\n<enquiry type="${input.enquiryType}" offer="${input.offer ?? "none"}">\n${input.message.slice(0, 3000)}\n</enquiry>`,
  });
}

export function aiMarketIntelligence(input: Record<string, unknown>, userId: string, vehicleId: string) {
  return runAiTask({
    task: "market_intelligence", prompt: "market_intelligence", schema: marketIntelligenceSchema, userId, vehicleId, effort: "low", maxTokens: 3000,
    inputSummary: "listing performance review", cacheTtlHours: 12,
    userContent: wrap("listing_performance", input),
  });
}
