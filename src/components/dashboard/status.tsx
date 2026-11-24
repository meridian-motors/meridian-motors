import { Badge } from "@/components/ui/badge";
import { ENQUIRY_STATUS_META, LISTING_STATUS_META, VEHICLE_STATUS_META } from "@/lib/constants";
import type { EnquiryStatus, ListingStatus, PaymentStatus, VehicleStatus } from "@/lib/types";

export const VehicleStatusBadge = ({ status }: { status: VehicleStatus }) => <Badge tone={VEHICLE_STATUS_META[status].tone}>{VEHICLE_STATUS_META[status].label}</Badge>;
export const ListingStatusBadge = ({ status }: { status: ListingStatus }) => <Badge tone={LISTING_STATUS_META[status].tone}>{LISTING_STATUS_META[status].label}</Badge>;
export const EnquiryStatusBadge = ({ status }: { status: EnquiryStatus }) => <Badge tone={ENQUIRY_STATUS_META[status].tone}>{ENQUIRY_STATUS_META[status].label}</Badge>;
const PAY: Record<PaymentStatus, ["neutral" | "success" | "warning" | "danger" | "info", string]> = {
  pending: ["warning", "Awaiting payment"], processing: ["info", "Processing"], succeeded: ["success", "Paid"], failed: ["danger", "Failed"],
  cancelled: ["neutral", "Cancelled"], refunded: ["neutral", "Refunded"], partially_refunded: ["info", "Partially refunded"],
};
export const PaymentStatusBadge = ({ status }: { status: PaymentStatus }) => <Badge tone={PAY[status][0]}>{PAY[status][1]}</Badge>;
