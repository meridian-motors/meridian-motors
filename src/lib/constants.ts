import type {
  BodyType, DocumentType, EnquiryStatus, EnquiryType, FuelType, ImageType, ListingStatus, ServiceHistory,
  Transmission, VehicleCondition, VehicleStatus,
} from "./types";

export const FUEL_LABELS: Record<FuelType, string> = {
  petrol: "Petrol", diesel: "Diesel", hybrid: "Hybrid", plug_in_hybrid: "Plug-in hybrid", electric: "Electric", lpg: "LPG", other: "Other",
};
export const TRANSMISSION_LABELS: Record<Transmission, string> = { manual: "Manual", automatic: "Automatic", semi_automatic: "Semi-automatic" };
export const BODY_LABELS: Record<BodyType, string> = {
  hatchback: "Hatchback", saloon: "Saloon", estate: "Estate", suv: "SUV", coupe: "Coupé", convertible: "Convertible", mpv: "MPV",
  pickup: "Pickup", van: "Van", other: "Other",
};
export const CONDITION_LABELS: Record<VehicleCondition, string> = {
  excellent: "Excellent", very_good: "Very good", good: "Good", fair: "Fair", poor: "Poor",
};
export const SERVICE_HISTORY_LABELS: Record<ServiceHistory, string> = {
  full: "Full service history", partial: "Partial service history", none: "No service history", unknown: "Not stated",
};
export const IMAGE_TYPE_LABELS: Record<ImageType, string> = {
  exterior: "Exterior", interior: "Interior", dashboard: "Dashboard", mileage: "Mileage display", damage: "Damage",
  engine: "Engine bay", boot: "Boot", wheels: "Wheels & tyres", other: "Other",
};
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  v5c: "V5C logbook", service_record: "Service record", mot_certificate: "MOT certificate", invoice: "Invoice / receipt",
  finance_settlement: "Finance settlement letter", inspection_report: "Inspection report", other: "Other document",
};

export const VEHICLE_STATUS_META: Record<VehicleStatus, { label: string; tone: "neutral" | "info" | "warning" | "success" | "danger" | "accent" | "dark"; stage: number }> = {
  draft: { label: "Draft", tone: "neutral", stage: 0 },
  submitted: { label: "Submitted", tone: "info", stage: 1 },
  awaiting_information: { label: "Awaiting information", tone: "warning", stage: 2 },
  verification_pending: { label: "Verification pending", tone: "info", stage: 3 },
  valuation_completed: { label: "Valuation completed", tone: "info", stage: 4 },
  awaiting_seller_approval: { label: "Awaiting seller approval", tone: "warning", stage: 5 },
  approved_for_publication: { label: "Approved for publication", tone: "accent", stage: 6 },
  published: { label: "Published", tone: "success", stage: 7 },
  receiving_enquiries: { label: "Receiving enquiries", tone: "success", stage: 8 },
  viewing_arranged: { label: "Viewing arranged", tone: "success", stage: 9 },
  offer_received: { label: "Offer received", tone: "accent", stage: 10 },
  sale_agreed: { label: "Sale agreed", tone: "accent", stage: 11 },
  payment_pending: { label: "Payment pending", tone: "warning", stage: 12 },
  handover_pending: { label: "Handover pending", tone: "warning", stage: 13 },
  completed: { label: "Completed", tone: "dark", stage: 14 },
  withdrawn: { label: "Withdrawn", tone: "neutral", stage: 15 },
  rejected: { label: "Rejected", tone: "danger", stage: 16 },
  cancelled: { label: "Cancelled", tone: "neutral", stage: 17 },
};
export const PIPELINE_ORDER = (Object.keys(VEHICLE_STATUS_META) as VehicleStatus[]).filter((s) => s !== "draft");

/** Mirror of the vehicle_status_transitions table (the database is the authority). */
export const STATUS_TRANSITIONS: Record<VehicleStatus, { to: VehicleStatus; actor: "seller" | "staff" | "system" }[]> = {
  draft: [{ to: "submitted", actor: "seller" }, { to: "withdrawn", actor: "seller" }],
  submitted: [{ to: "awaiting_information", actor: "staff" }, { to: "verification_pending", actor: "staff" }, { to: "rejected", actor: "staff" }, { to: "withdrawn", actor: "seller" }, { to: "cancelled", actor: "staff" }],
  awaiting_information: [{ to: "submitted", actor: "seller" }, { to: "verification_pending", actor: "staff" }, { to: "rejected", actor: "staff" }, { to: "withdrawn", actor: "seller" }],
  verification_pending: [{ to: "valuation_completed", actor: "staff" }, { to: "awaiting_information", actor: "staff" }, { to: "rejected", actor: "staff" }, { to: "withdrawn", actor: "seller" }],
  valuation_completed: [{ to: "awaiting_seller_approval", actor: "staff" }, { to: "awaiting_information", actor: "staff" }, { to: "withdrawn", actor: "seller" }],
  awaiting_seller_approval: [{ to: "approved_for_publication", actor: "seller" }, { to: "awaiting_information", actor: "staff" }, { to: "withdrawn", actor: "seller" }],
  approved_for_publication: [{ to: "published", actor: "staff" }, { to: "awaiting_seller_approval", actor: "staff" }, { to: "withdrawn", actor: "seller" }],
  published: [{ to: "receiving_enquiries", actor: "system" }, { to: "viewing_arranged", actor: "staff" }, { to: "offer_received", actor: "staff" }, { to: "sale_agreed", actor: "staff" }, { to: "withdrawn", actor: "seller" }, { to: "cancelled", actor: "staff" }],
  receiving_enquiries: [{ to: "viewing_arranged", actor: "staff" }, { to: "offer_received", actor: "staff" }, { to: "sale_agreed", actor: "staff" }, { to: "published", actor: "staff" }, { to: "withdrawn", actor: "seller" }],
  viewing_arranged: [{ to: "offer_received", actor: "staff" }, { to: "receiving_enquiries", actor: "staff" }, { to: "sale_agreed", actor: "staff" }, { to: "withdrawn", actor: "seller" }],
  offer_received: [{ to: "sale_agreed", actor: "staff" }, { to: "receiving_enquiries", actor: "staff" }, { to: "withdrawn", actor: "seller" }],
  sale_agreed: [{ to: "payment_pending", actor: "staff" }, { to: "handover_pending", actor: "staff" }, { to: "receiving_enquiries", actor: "staff" }, { to: "cancelled", actor: "staff" }],
  payment_pending: [{ to: "handover_pending", actor: "staff" }, { to: "sale_agreed", actor: "staff" }, { to: "cancelled", actor: "staff" }],
  handover_pending: [{ to: "completed", actor: "staff" }, { to: "sale_agreed", actor: "staff" }, { to: "cancelled", actor: "staff" }],
  completed: [],
  withdrawn: [{ to: "submitted", actor: "seller" }],
  rejected: [{ to: "awaiting_information", actor: "staff" }],
  cancelled: [],
};

export const SELLER_EDITABLE_STATUSES: VehicleStatus[] = ["draft", "submitted", "awaiting_information", "verification_pending", "valuation_completed", "awaiting_seller_approval", "withdrawn"];
export const PUBLIC_STATUSES: VehicleStatus[] = ["published", "receiving_enquiries", "viewing_arranged", "offer_received"];

export const LISTING_STATUS_META: Record<ListingStatus, { label: string; tone: "neutral" | "info" | "warning" | "success" | "danger" | "accent" | "dark" }> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_approval: { label: "Pending Meridian review", tone: "warning" },
  approved: { label: "Approved", tone: "accent" },
  published: { label: "Live", tone: "success" },
  paused: { label: "Paused", tone: "neutral" },
  sold: { label: "Sold", tone: "dark" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
  rejected: { label: "Rejected", tone: "danger" },
  expired: { label: "Expired", tone: "neutral" },
  archived: { label: "Archived", tone: "neutral" },
};

export const ENQUIRY_TYPE_LABELS: Record<EnquiryType, string> = {
  general: "General question", viewing_request: "Arrange a viewing", price_question: "Price question", history_question: "History question",
  finance_question: "Finance question", part_exchange: "Part exchange", offer: "Make an offer", other: "Other",
};
export const ENQUIRY_STATUS_META: Record<EnquiryStatus, { label: string; tone: "neutral" | "info" | "warning" | "success" | "danger" | "accent" | "dark" }> = {
  new: { label: "New", tone: "accent" }, assigned: { label: "Assigned", tone: "info" }, in_progress: { label: "In progress", tone: "info" },
  awaiting_buyer: { label: "Awaiting buyer", tone: "warning" }, awaiting_seller: { label: "Awaiting seller", tone: "warning" },
  viewing_arranged: { label: "Viewing arranged", tone: "success" }, offer_made: { label: "Offer made", tone: "accent" },
  closed_won: { label: "Closed — sold", tone: "dark" }, closed_lost: { label: "Closed", tone: "neutral" }, spam: { label: "Spam", tone: "danger" },
};

export const ROLE_LABELS: Record<string, string> = {
  customer: "Customer", verification_operator: "Verification operator", sales_operator: "Sales operator", admin: "Administrator", super_admin: "Super administrator",
};

export const STAFF_ROLES = ["verification_operator", "sales_operator", "admin", "super_admin"] as const;
export const POPULAR_MAKES = ["Audi", "BMW", "Ford", "Honda", "Hyundai", "Jaguar", "Kia", "Land Rover", "Lexus", "Mazda", "Mercedes-Benz", "MINI", "Nissan", "Peugeot", "Porsche", "Renault", "Skoda", "Tesla", "Toyota", "Vauxhall", "Volkswagen", "Volvo"];
