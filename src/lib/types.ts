// Domain types mirroring the database schema (supabase/migrations).
export type AppRole = "customer" | "verification_operator" | "sales_operator" | "admin" | "super_admin";
export type FuelType = "petrol" | "diesel" | "hybrid" | "plug_in_hybrid" | "electric" | "lpg" | "other";
export type Transmission = "manual" | "automatic" | "semi_automatic";
export type BodyType = "hatchback" | "saloon" | "estate" | "suv" | "coupe" | "convertible" | "mpv" | "pickup" | "van" | "other";
export type VehicleCondition = "excellent" | "very_good" | "good" | "fair" | "poor";
export type ServiceHistory = "full" | "partial" | "none" | "unknown";
export type VehicleStatus =
  | "draft" | "submitted" | "awaiting_information" | "verification_pending" | "valuation_completed"
  | "awaiting_seller_approval" | "approved_for_publication" | "published" | "receiving_enquiries"
  | "viewing_arranged" | "offer_received" | "sale_agreed" | "payment_pending" | "handover_pending"
  | "completed" | "withdrawn" | "rejected" | "cancelled";
export type ListingStatus = "draft" | "pending_approval" | "approved" | "published" | "paused" | "sold" | "withdrawn" | "rejected" | "expired" | "archived";
export type EnquiryType = "general" | "viewing_request" | "price_question" | "history_question" | "finance_question" | "part_exchange" | "offer" | "other";
export type EnquiryStatus = "new" | "assigned" | "in_progress" | "awaiting_buyer" | "awaiting_seller" | "viewing_arranged" | "offer_made" | "closed_won" | "closed_lost" | "spam";
export type ImageType = "exterior" | "interior" | "dashboard" | "mileage" | "damage" | "engine" | "boot" | "wheels" | "other";
export type DocumentType = "v5c" | "service_record" | "mot_certificate" | "invoice" | "finance_settlement" | "inspection_report" | "other";
export type PaymentStatus = "pending" | "processing" | "succeeded" | "failed" | "cancelled" | "refunded" | "partially_refunded";

export interface Profile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: AppRole;
  account_status: "active" | "suspended" | "pending_deletion" | "deleted";
  marketing_consent: boolean;
  created_at: string;
}

export interface Vehicle {
  id: string;
  owner_id: string | null;
  dealership_id: string | null;
  registration_number: string | null;
  vin: string | null;
  make: string | null;
  model: string | null;
  derivative: string | null;
  year: number | null;
  mileage: number | null;
  fuel_type: FuelType | null;
  transmission: Transmission | null;
  body_type: BodyType | null;
  engine_size: number | null;
  colour: string | null;
  doors: number | null;
  seats: number | null;
  specification: string[];
  condition: VehicleCondition | null;
  cosmetic_damage: string | null;
  mechanical_issues: string | null;
  accident_history: string | null;
  has_outstanding_finance: boolean | null;
  modifications: string | null;
  other_disclosures: string | null;
  disclosures_confirmed_at: string | null;
  service_history: ServiceHistory;
  service_history_notes: string | null;
  mot_expiry: string | null;
  mot_source: string | null;
  previous_keepers: number | null;
  description: string | null;
  location: string | null;
  postcode: string | null;
  postcode_district: string | null;
  latitude: number | null;
  longitude: number | null;
  vehicle_status: VehicleStatus;
  submission_step: number;
  submission_data: Record<string, unknown>;
  submitted_at: string | null;
  seller_declaration_at: string | null;
  source: "seller_submission" | "admin_manual" | "import";
  is_flagged: boolean;
  flag_reason: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaleTerms {
  vehicle_id: string;
  desired_asking_price: number | null;
  expected_selling_price: number | null;
  minimum_authorised_price: number | null;
  preferred_contact_method: "email" | "phone" | "platform_messages";
  seller_comments: string | null;
}

export interface Listing {
  id: string;
  vehicle_id: string;
  slug: string;
  title: string | null;
  short_description: string | null;
  description: string | null;
  highlights: string[];
  search_tags: string[];
  description_source: "seller" | "staff" | "ai_approved";
  asking_price: number | null;
  location: string | null;
  listing_status: ListingStatus;
  featured: boolean;
  seller_approved_at: string | null;
  admin_approved_at: string | null;
  rejection_reason: string | null;
  information_request: string | null;
  published_at: string | null;
  expires_at: string | null;
  view_count: number;
  save_count: number;
  enquiry_count: number;
  created_at: string;
  updated_at: string;
}

export interface PublicListing {
  id: string;
  slug: string;
  vehicle_id: string;
  title: string;
  short_description: string | null;
  description: string | null;
  highlights: string[];
  search_tags: string[];
  asking_price: number;
  featured: boolean;
  published_at: string;
  view_count: number;
  make: string;
  model: string;
  derivative: string | null;
  year: number;
  mileage: number;
  fuel_type: FuelType;
  transmission: Transmission;
  body_type: BodyType | null;
  engine_size: number | null;
  colour: string | null;
  doors: number | null;
  seats: number | null;
  specification: string[];
  condition: VehicleCondition | null;
  cosmetic_damage: string | null;
  mechanical_issues: string | null;
  accident_history: string | null;
  has_outstanding_finance: boolean | null;
  modifications: string | null;
  other_disclosures: string | null;
  service_history: ServiceHistory;
  service_history_notes: string | null;
  mot_expiry_verified: string | null;
  mot_source: string | null;
  previous_keepers: number | null;
  location: string | null;
  postcode_district: string | null;
  latitude: number | null;
  longitude: number | null;
  seller_type: "private" | "trade";
  primary_image_url: string | null;
  images: { url: string; type: ImageType; width: number | null; height: number | null }[];
  checks: { check_type: string; provider: string; result: string; checked_at: string; summary: string | null; limitations: string | null }[];
  verifications: { verification_type: string; verified_at: string; summary: string | null }[];
  distance?: number | null;
  rank?: number;
}

export type ListingCardData = Pick<
  PublicListing,
  "id" | "slug" | "vehicle_id" | "title" | "asking_price" | "make" | "model" | "derivative" | "year" | "mileage" | "fuel_type"
  | "transmission" | "body_type" | "location" | "postcode_district" | "seller_type" | "primary_image_url" | "featured" | "published_at"
> & { distance?: number | null; short_description?: string | null };

export interface Valuation {
  id: string;
  vehicle_id: string;
  market_value_min: number | null;
  market_value_max: number | null;
  recommended_asking_price: number | null;
  fast_sale_price: number | null;
  confidence_score: number | null;
  comparable_count: number;
  valuation_source: string;
  engine_version: string;
  valuation_explanation: string | null;
  explanation_source: "deterministic" | "ai";
  data_limitations: string[];
  inputs: Record<string, unknown>;
  valuation_status: "pending" | "completed" | "insufficient_data" | "failed" | "superseded";
  valid_until: string | null;
  created_at: string;
}

export interface Comparable {
  id: string;
  valuation_id: string;
  source_provider: string;
  external_reference: string;
  vehicle_details: Record<string, unknown>;
  observed_price: number;
  adjusted_price: number | null;
  similarity: number | null;
  price_type: "asking" | "sold";
  source_date: string;
}

export interface PriceRecommendation {
  id: string;
  vehicle_id: string;
  valuation_id: string | null;
  recommended_price: number;
  recommendation_type: "market" | "asking" | "fast_sale" | "price_review";
  explanation: string | null;
  confidence_score: number | null;
  approved_by_seller: boolean | null;
  seller_decision_at: string | null;
  created_at: string;
}

export interface Enquiry {
  id: string;
  listing_id: string;
  vehicle_id: string;
  buyer_id: string | null;
  seller_id: string | null;
  enquiry_type: EnquiryType;
  message: string;
  offer_amount: number | null;
  buyer_display_name: string | null;
  enquiry_status: EnquiryStatus;
  priority: "low" | "normal" | "high";
  assigned_to: string | null;
  follow_up_at: string | null;
  ai_category: string | null;
  ai_summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  sender_role: "buyer" | "seller" | "staff" | "system";
  message: string;
  message_type: "text" | "system";
  read_at: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  notification_type: string;
  title: string;
  message: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  transaction_id: string | null;
  service_order_id: string | null;
  amount: number;
  refunded_amount: number;
  currency: string;
  payment_status: PaymentStatus;
  payment_type: "sale_fee" | "service" | "subscription";
  description: string | null;
  receipt_url: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface MarketplaceFilters {
  q?: string;
  make?: string;
  model?: string;
  minPrice?: number;
  maxPrice?: number;
  minYear?: number;
  maxYear?: number;
  maxMileage?: number;
  fuel?: FuelType[];
  transmission?: Transmission[];
  body?: BodyType[];
  condition?: VehicleCondition[];
  location?: string;
  postcode?: string;
  radius?: number;
  sort?: "newest" | "price_asc" | "price_desc" | "mileage_asc" | "relevance" | "distance";
  page?: number;
}
