import Link from "next/link";
import Image from "next/image";
import { Car, Fuel, Gauge, MapPin, Settings2 } from "lucide-react";
import type { ListingCardData } from "@/lib/types";
import { FUEL_LABELS, TRANSMISSION_LABELS } from "@/lib/constants";
import { formatMileage, formatPrice } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { SaveButton } from "./save-button";

export function VehicleImage({ src, alt, sizes, priority, className }: { src: string | null; alt: string; sizes: string; priority?: boolean; className?: string }) {
  if (!src) {
    return (
      <div className={`flex size-full flex-col items-center justify-center gap-2 bg-mist text-silver ${className ?? ""}`}>
        <Car className="size-8" strokeWidth={1.25} />
        <span className="text-[11px] uppercase tracking-[0.14em]">Photographs pending</span>
      </div>
    );
  }
  return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className={`object-cover ${className ?? ""}`} />;
}

export function VehicleCard({ listing, saved, signedIn, priority }: { listing: ListingCardData; saved?: boolean; signedIn?: boolean; priority?: boolean }) {
  const name = `${listing.year} ${listing.make} ${listing.model}`;
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[var(--radius-md)] border border-line bg-white transition-shadow duration-300 hover:shadow-[var(--shadow-lift)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-mist">
        <VehicleImage src={listing.primary_image_url} alt={name} sizes="(min-width:1280px) 25vw, (min-width:768px) 33vw, 100vw" priority={priority}
          className="transition-transform duration-700 ease-[var(--ease-premium)] group-hover:scale-[1.03]" />
        <div className="absolute left-3 top-3 flex gap-1.5">
          {listing.featured ? <Badge tone="dark">Featured</Badge> : null}
          <Badge tone="outline" className="border-white/60 bg-white/90 backdrop-blur">{listing.seller_type === "trade" ? "Trade seller" : "Private seller"}</Badge>
        </div>
        <div className="absolute right-3 top-3 z-10">
          <SaveButton vehicleId={listing.vehicle_id} initialSaved={!!saved} signedIn={!!signedIn} compact />
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold text-ink">
              <Link href={`/cars/${listing.slug}`} className="after:absolute after:inset-0 after:content-['']">{name}</Link>
            </h3>
            <p className="mt-0.5 truncate text-[12.5px] text-muted">{listing.derivative ?? listing.title}</p>
          </div>
          <p className="shrink-0 font-[family-name:var(--font-display)] text-[17px] font-semibold tracking-[-0.02em] text-ink">{formatPrice(listing.asking_price)}</p>
        </div>
        <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line pt-3.5 text-[12.5px] text-slate">
          <li className="flex items-center gap-1.5"><Gauge className="size-3.5 text-silver" />{formatMileage(listing.mileage)}</li>
          <li className="flex items-center gap-1.5"><Fuel className="size-3.5 text-silver" />{FUEL_LABELS[listing.fuel_type]}</li>
          <li className="flex items-center gap-1.5"><Settings2 className="size-3.5 text-silver" />{TRANSMISSION_LABELS[listing.transmission]}</li>
          <li className="flex items-center gap-1.5 truncate"><MapPin className="size-3.5 shrink-0 text-silver" />
            <span className="truncate">{listing.location ?? listing.postcode_district ?? "UK"}{listing.distance != null ? ` · ${Math.round(listing.distance)} mi` : ""}</span>
          </li>
        </ul>
      </div>
    </article>
  );
}

export function VehicleGrid({ listings, savedIds, signedIn }: { listings: ListingCardData[]; savedIds?: Set<string>; signedIn?: boolean }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {listings.map((l, i) => <VehicleCard key={l.id} listing={l} saved={savedIds?.has(l.vehicle_id)} signedIn={signedIn} priority={i < 3} />)}
    </div>
  );
}
