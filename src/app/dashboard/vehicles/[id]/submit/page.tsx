import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { integrationStatus } from "@/lib/env";
import { SubmissionWizard } from "@/components/dashboard/wizard";
import { PageHeader } from "@/components/ui/misc";
import { vehicleName } from "@/lib/format";
import type { Comparable, PriceRecommendation, SaleTerms, Valuation, Vehicle } from "@/lib/types";

export const metadata = { title: "Vehicle submission" };

export default async function SubmitPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await requireUser(`/dashboard/vehicles/${id}/submit`);
  const supabase = await createClient();
  const { data: vehicle } = await supabase.from("vehicles").select("*").eq("id", id).eq("owner_id", session.sellerId ?? "").is("deleted_at", null).maybeSingle();
  if (!vehicle) notFound();
  const v = vehicle as Vehicle;
  if (!["draft", "awaiting_information", "withdrawn"].includes(v.vehicle_status)) redirect(`/dashboard/vehicles/${id}`);

  const [{ data: terms }, { data: images }, { data: documents }, { data: valuation }, { data: recs }] = await Promise.all([
    supabase.from("vehicle_sale_terms").select("*").eq("vehicle_id", id).maybeSingle(),
    supabase.from("vehicle_images").select("id, public_url, image_type, is_primary, display_order").eq("vehicle_id", id).order("display_order"),
    supabase.from("vehicle_documents").select("id, document_type, file_name, size_bytes, created_at").eq("vehicle_id", id).order("created_at", { ascending: false }),
    supabase.from("valuations").select("*").eq("vehicle_id", id).in("valuation_status", ["completed", "insufficient_data"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("price_recommendations").select("*").eq("vehicle_id", id).order("created_at", { ascending: false }).limit(10),
  ]);
  const { data: comps } = valuation ? await supabase.from("comparable_vehicles").select("*").eq("valuation_id", valuation.id).order("similarity", { ascending: false }) : { data: [] };
  const requested = Number(sp.step);
  const step = (Number.isInteger(requested) && requested >= 1 && requested <= Math.max(v.submission_step, 1) ? requested : v.submission_step) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

  return (
    <>
      <PageHeader eyebrow={v.vehicle_status === "awaiting_information" ? "Information requested" : "Sell your vehicle"}
        title={v.make ? vehicleName(v) : "New vehicle submission"} description="Your progress is saved automatically. You can leave and return at any time." />
      <SubmissionWizard vehicle={v} terms={terms as SaleTerms | null} images={images ?? []} documents={documents ?? []} valuation={valuation as Valuation | null}
        comparables={(comps ?? []) as Comparable[]} recommendations={(recs ?? []) as PriceRecommendation[]} initialStep={step} dvlaConfigured={integrationStatus().dvla} />
    </>
  );
}
