import Link from "next/link";
import Image from "next/image";
import { Car, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { VehicleStatusBadge } from "@/components/dashboard/status";
import { formatMileage, formatPrice, timeAgo, vehicleName } from "@/lib/format";
import type { VehicleStatus } from "@/lib/types";

export const metadata = { title: "My vehicles" };

export default async function VehiclesPage() {
  const session = await requireUser();
  const supabase = await createClient();
  const { data: vehicles } = session.sellerId
    ? await supabase.from("vehicles").select("id, make, model, year, mileage, vehicle_status, submission_step, updated_at, vehicle_images(public_url, is_primary), listings(asking_price, view_count, enquiry_count, slug, listing_status)")
        .eq("owner_id", session.sellerId).is("deleted_at", null).order("updated_at", { ascending: false })
    : { data: [] };
  return (
    <>
      <PageHeader eyebrow="Selling" title="My vehicles" actions={<Button asChild><Link href="/dashboard/vehicles/new"><Plus /> Add a vehicle</Link></Button>} />
      {!vehicles?.length ? (
        <Card><EmptyState icon={<Car />} title="No vehicles yet" description="Submit your first vehicle — it takes around ten minutes and saves as you go." action={<Button asChild><Link href="/dashboard/vehicles/new">Start a submission</Link></Button>} /></Card>
      ) : (
        <div className="grid gap-4">
          {vehicles.map((v) => {
            const img = v.vehicle_images?.find((i: { is_primary: boolean }) => i.is_primary) ?? v.vehicle_images?.[0];
            const listing = v.listings?.[0] as { asking_price: number | null; view_count: number; enquiry_count: number } | undefined;
            const href = v.vehicle_status === "draft" ? `/dashboard/vehicles/${v.id}/submit` : `/dashboard/vehicles/${v.id}`;
            return (
              <Link key={v.id} href={href} className="flex flex-col gap-4 rounded-[var(--radius-md)] border border-line bg-white p-4 transition-shadow hover:shadow-[var(--shadow-soft)] sm:flex-row sm:items-center">
                <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-mist sm:w-36">
                  {img ? <Image src={img.public_url} alt="" fill sizes="144px" className="object-cover" /> : <Car className="absolute inset-0 m-auto size-6 text-silver" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-ink">{vehicleName(v)}</p><VehicleStatusBadge status={v.vehicle_status as VehicleStatus} /></div>
                  <p className="mt-1 text-[13px] text-muted">{v.vehicle_status === "draft" ? `Draft · step ${v.submission_step} of 8` : formatMileage(v.mileage)} · updated {timeAgo(v.updated_at)}</p>
                </div>
                <div className="flex gap-6 text-[13px] sm:text-right">
                  {listing?.asking_price ? <div><p className="font-semibold text-ink">{formatPrice(listing.asking_price)}</p><p className="text-muted">Asking</p></div> : null}
                  {listing ? <div><p className="font-semibold text-ink">{listing.view_count}</p><p className="text-muted">Views</p></div> : null}
                  {listing ? <div><p className="font-semibold text-ink">{listing.enquiry_count}</p><p className="text-muted">Enquiries</p></div> : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
