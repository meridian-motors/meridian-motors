import { ClipboardList, FileText, Camera, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { startSubmission, startNewSubmission } from "@/app/actions/seller";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";

export const metadata = { title: "Sell a vehicle" };

export default async function NewVehiclePage() {
  const session = await requireUser("/dashboard/vehicles/new");
  const supabase = await createClient();
  const { count: drafts } = session.sellerId
    ? await supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("owner_id", session.sellerId).eq("vehicle_status", "draft").is("deleted_at", null)
    : { count: 0 };
  return (
    <>
      <PageHeader eyebrow="Selling" title="Sell your vehicle" description="Eight short steps. Your progress saves automatically and you can return at any time." />
      <Card className="max-w-3xl p-6 sm:p-8">
        <ul className="grid gap-5 sm:grid-cols-2">
          {[[ClipboardList, "Your registration and V5C details"], [FileText, "Service history and MOT information"], [Camera, "At least 4 photographs, including the mileage display"], [Sparkles, "Your price expectations and the lowest price you'd accept"]].map(([Icon, t]) => {
            const I = Icon as typeof ClipboardList;
            return <li key={String(t)} className="flex items-start gap-3 text-[14px] text-slate"><I className="mt-0.5 size-4 shrink-0 text-accent" />{String(t)}</li>;
          })}
        </ul>
        <div className="mt-8 flex flex-wrap gap-3 border-t border-line pt-6">
          <form action={startSubmission}><Button size="lg">{drafts ? "Continue your draft" : "Start submission"}</Button></form>
          {drafts ? <form action={startNewSubmission}><Button size="lg" variant="secondary">Start a different vehicle</Button></form> : null}
        </div>
        <p className="mt-4 text-[12.5px] text-muted">Submitting is free. You remain the owner and seller of your vehicle, and you approve your listing and price before anything is published.</p>
      </Card>
    </>
  );
}
