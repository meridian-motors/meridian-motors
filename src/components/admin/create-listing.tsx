"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { staffCreateListing } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CreateListingForm({ vehicleId, defaultPrice }: { vehicleId: string; defaultPrice: number | null }) {
  const router = useRouter();
  const [price, setPrice] = useState(defaultPrice?.toString() ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <p className="mb-2 text-[13px] text-muted">Create the listing record with an asking price authorised by the owner.</p>
      <div className="flex max-w-sm gap-2"><Input aria-label="Asking price" inputMode="numeric" placeholder="Asking price £" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))} />
        <Button disabled={pending || !price} onClick={() => start(async () => { const r = await staffCreateListing(vehicleId, Number(price)); if (!r.ok) setErr(r.error); router.refresh(); })}>Create listing</Button></div>
      {err ? <p className="mt-2 text-[13px] text-danger">{err}</p> : null}
    </div>
  );
}
