import { z } from "zod";

export const phoneSchema = z.string().trim().regex(/^[0-9+() -]{7,20}$/, "Enter a valid phone number");
export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);

export const enquirySchema = z.object({
  listingId: z.uuid(),
  enquiryType: z.enum(["general", "viewing_request", "price_question", "history_question", "finance_question", "part_exchange", "offer", "other"]),
  message: z.string().trim().min(10, "Please write at least 10 characters").max(3000, "Please keep your message under 3,000 characters"),
  fullName: z.string().trim().min(2, "Enter your name").max(120),
  email: emailSchema,
  phone: z.union([phoneSchema, z.literal("")]).optional(),
  offerAmount: z.coerce.number().int().min(100).max(5_000_000).optional(),
  consent: z.literal(true, { error: "Please confirm you agree to the privacy notice" }),
  website: z.string().max(0).optional(), // honeypot
}).refine((d) => d.enquiryType !== "offer" || d.offerAmount != null, { path: ["offerAmount"], message: "Enter your offer amount" });

export const contactSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name").max(120),
  email: emailSchema,
  phone: z.union([phoneSchema, z.literal("")]).optional(),
  topic: z.enum(["buying", "selling", "account", "complaint", "data_protection", "press", "other"]),
  message: z.string().trim().min(10, "Please write at least 10 characters").max(4000),
  website: z.string().max(0).optional(),
});

export const registerSchema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name").max(80),
  lastName: z.string().trim().min(1, "Enter your last name").max(80),
  email: emailSchema,
  password: z.string().min(10, "Use at least 10 characters").max(128)
    .regex(/[A-Za-z]/, "Include at least one letter").regex(/[0-9]/, "Include at least one number"),
  terms: z.literal(true, { error: "You must accept the terms to continue" }),
  marketing: z.boolean().optional(),
});

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password") });
export const passwordSchema = registerSchema.shape.password;
