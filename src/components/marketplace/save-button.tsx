"use client";
import { useOptimistic, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Heart } from "lucide-react";
import { toggleSavedVehicle } from "@/app/actions/buyer";
import { cn } from "@/lib/utils";

export function SaveButton({ vehicleId, initialSaved, signedIn, compact }: { vehicleId: string; initialSaved: boolean; signedIn: boolean; compact?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [saved, setSaved] = useOptimistic(initialSaved);
  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!signedIn) { router.push(`/login?next=${encodeURIComponent(pathname)}`); return; }
    start(async () => {
      setSaved(!saved);
      const res = await toggleSavedVehicle(vehicleId);
      if (!res.ok) alert(res.error);
      router.refresh();
    });
  };
  return (
    <button type="button" onClick={onClick} disabled={pending} aria-pressed={saved} aria-label={saved ? "Remove from saved vehicles" : "Save vehicle"}
      className={cn("inline-flex items-center justify-center gap-2 transition-colors",
        compact ? "size-9 rounded-full bg-white/90 backdrop-blur hover:bg-white" : "h-10 rounded-[var(--radius-sm)] border border-line bg-white px-4 text-sm font-medium hover:border-silver")}>
      <Heart className={cn("size-4", saved ? "fill-accent text-accent" : "text-ink")} />
      {compact ? null : saved ? "Saved" : "Save"}
    </button>
  );
}
