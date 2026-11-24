import Link from "next/link";
import { Heart } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { VehicleGrid } from "@/components/marketplace/vehicle-card";
import type { ListingCardData } from "@/lib/types";

export const metadata = { title: "Saved vehicles" };

export default async function SavedPage() {
  await requireUser("/dashboard/saved");
  const supabase = await createClient();
  const { data: saved } = await supabase.from("saved_vehicles").select("vehicle_id, created_at").order("created_at", { ascending: false });
  const ids = (saved ?? []).map((s) => s.vehicle_id);
  const { data: listings } = ids.length ? await supabase.from("public_listings").select("id, slug, vehicle_id, title, asking_price, make, model, derivative, year, mileage, fuel_type, transmission, body_type, location, postcode_district, seller_type, primary_image_url, featured, published_at").in("vehicle_id", ids) : { data: [] };
  const available = (listings ?? []) as ListingCardData[];
  const unavailable = ids.length - available.length;
  return (
    <>
      <PageHeader eyebrow="Buying" title="Saved vehicles" />
      {unavailable > 0 ? <p className="mb-4 text-[13px] text-muted">{unavailable} saved vehicle{unavailable === 1 ? " is" : "s are"} no longer available (sold or withdrawn).</p> : null}
      {available.length ? <VehicleGrid listings={available} savedIds={new Set(ids)} signedIn /> : (
        <Card><EmptyState icon={<Heart />} title="No saved vehicles" description="Tap the heart on any vehicle to keep track of it here." action={<Button asChild><Link href="/cars">Browse vehicles</Link></Button>} /></Card>
      )}
    </>
  );
}
