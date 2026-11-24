import { z } from "zod";

const thisYear = new Date().getFullYear();
const optText = (max: number) => z.string().trim().max(max).transform((s) => (s === "" ? null : s)).nullable().optional();
const optInt = (min: number, max: number, msg?: string) =>
  z.preprocess((v) => (v === "" || v == null ? null : typeof v === "string" ? Number(v.replace(/[,£\s]/g, "")) : v),
    z.number({ error: msg ?? "Enter a number" }).int(msg ?? "Enter a whole number").min(min, msg).max(max, msg).nullable()).optional();
const reqInt = (min: number, max: number, msg: string) =>
  z.preprocess((v) => (v === "" || v == null ? undefined : typeof v === "string" ? Number(v.replace(/[,£\s]/g, "")) : v),
    z.number({ error: msg }).int(msg).min(min, msg).max(max, msg));

export const FUEL = ["petrol", "diesel", "hybrid", "plug_in_hybrid", "electric", "lpg", "other"] as const;
export const TRANS = ["manual", "automatic", "semi_automatic"] as const;
export const BODY = ["hatchback", "saloon", "estate", "suv", "coupe", "convertible", "mpv", "pickup", "van", "other"] as const;
export const COND = ["excellent", "very_good", "good", "fair", "poor"] as const;

export const step1Schema = z.object({
  registration_number: z.string().trim().toUpperCase().transform((s) => s.replace(/[^A-Z0-9]/g, "")).pipe(z.string().regex(/^[A-Z0-9]{2,8}$/, "Enter a valid UK registration")),
  make: z.string().trim().min(1, "Enter the make").max(40),
  model: z.string().trim().min(1, "Enter the model").max(60),
  derivative: optText(120),
  year: reqInt(1950, thisYear + 1, `Enter a year between 1950 and ${thisYear + 1}`),
  vin: z.string().trim().toUpperCase().transform((s) => (s === "" ? null : s.replace(/\s/g, ""))).pipe(z.string().regex(/^[A-HJ-NPR-Z0-9]{17}$/, "A VIN is 17 characters (no I, O or Q)").nullable()).optional(),
});

export const step2Schema = z.object({
  mileage: reqInt(0, 1_500_000, "Enter the current mileage"),
  fuel_type: z.enum(FUEL, { error: "Select a fuel type" }),
  transmission: z.enum(TRANS, { error: "Select a transmission" }),
  engine_size: optInt(0, 10000, "Engine size in cc, e.g. 1498"),
  body_type: z.enum(BODY, { error: "Select a body type" }),
  colour: optText(40),
  doors: optInt(1, 7, "Doors must be 1–7"),
  seats: optInt(1, 12, "Seats must be 1–12"),
  specification: z.array(z.string().trim().min(1).max(60)).max(40).default([]),
});

export const step3Schema = z.object({
  condition: z.enum(COND, { error: "Select the overall condition" }),
  cosmetic_damage: optText(2000),
  mechanical_issues: optText(2000),
  accident_history: optText(2000),
  has_outstanding_finance: z.preprocess((v) => (v === "yes" ? true : v === "no" ? false : v), z.boolean({ error: "Tell us whether there is outstanding finance" })),
  modifications: optText(2000),
  other_disclosures: optText(2000),
  disclosures_confirmed: z.literal(true, { error: "Please confirm your disclosures are accurate" }),
});

export const step4Schema = z.object({
  service_history: z.enum(["full", "partial", "none", "unknown"]),
  service_history_notes: optText(2000),
  mot_expiry: z.string().trim().transform((s) => (s === "" ? null : s)).pipe(z.iso.date("Enter a valid date").nullable()).optional(),
  previous_keepers: optInt(0, 50, "Enter a number between 0 and 50"),
});

export const step6Schema = z.object({
  location: z.string().trim().min(2, "Enter your town or city").max(80),
  postcode: z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$/, "Enter a valid UK postcode")),
  desired_asking_price: reqInt(100, 5_000_000, "Enter your desired asking price"),
  expected_selling_price: optInt(100, 5_000_000, "Enter a valid amount"),
  minimum_authorised_price: reqInt(100, 5_000_000, "Enter the lowest price you would accept"),
  preferred_contact_method: z.enum(["email", "phone", "platform_messages"]),
  seller_comments: optText(2000),
  description: optText(6000),
}).refine((d) => d.minimum_authorised_price <= d.desired_asking_price, { path: ["minimum_authorised_price"], message: "Your minimum can't be above your asking price" });

export const STEP_SCHEMAS = { 1: step1Schema, 2: step2Schema, 3: step3Schema, 4: step4Schema, 6: step6Schema } as const;

export const STEPS = [
  { n: 1, title: "Registration", description: "Identify your vehicle" },
  { n: 2, title: "Specification", description: "Mileage, engine and equipment" },
  { n: 3, title: "Condition", description: "Condition and disclosures" },
  { n: 4, title: "History", description: "Service, MOT and documents" },
  { n: 5, title: "Photographs", description: "Show buyers your car" },
  { n: 6, title: "Selling details", description: "Location and pricing" },
  { n: 7, title: "Valuation", description: "Indicative Fast Sale pricing" },
  { n: 8, title: "Review & submit", description: "Check and confirm" },
] as const;

export const MIN_PHOTOS = 4;
