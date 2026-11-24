import { requireStaff } from "@/lib/auth";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { ManualVehicleForm } from "@/components/admin/controls";

export const metadata = { title: "Add vehicle" };

export default async function NewManualVehicle() {
  await requireStaff(["sales_operator"]);
  return (<><PageHeader eyebrow="Inventory" title="Add a vehicle manually" description="Creates a draft vehicle record. Add photographs, pricing and listing copy on the next screen." />
    <Card className="max-w-3xl"><CardBody><ManualVehicleForm /></CardBody></Card></>);
}
