import { FileText } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { DocumentManager } from "@/components/dashboard/uploaders";
import { vehicleName } from "@/lib/format";
import type { DocumentType } from "@/lib/types";

export const metadata = { title: "Documents" };

export default async function DocumentsPage() {
  const session = await requireUser();
  const supabase = await createClient();
  const { data: vehicles } = await supabase.from("vehicles").select("id, make, model, year, vehicle_status, vehicle_documents(id, document_type, file_name, size_bytes, created_at)")
    .eq("owner_id", session.sellerId ?? "").is("deleted_at", null).order("updated_at", { ascending: false });
  return (
    <>
      <PageHeader eyebrow="Selling" title="Documents" description="Private documents for your vehicles. Only you and authorised Meridian staff can view them." />
      {!vehicles?.length ? <Card><EmptyState icon={<FileText />} title="No vehicles yet" /></Card> : (
        <div className="space-y-6">
          {vehicles.map((v) => (
            <Card key={v.id}>
              <CardHeader title={v.make ? vehicleName(v) : "Draft vehicle"} />
              <CardBody><DocumentManager vehicleId={v.id} editable={v.vehicle_status !== "completed"}
                documents={(v.vehicle_documents ?? []) as { id: string; document_type: DocumentType; file_name: string; size_bytes: number; created_at: string }[]} /></CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
