"use client";
import { useState, useTransition } from "react";
import { BellPlus, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { saveSearch } from "@/app/actions/buyer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Input, Label } from "@/components/ui/input";
import type { MarketplaceFilters } from "@/lib/types";

export function SaveSearchButton({ filters, signedIn, suggestedName }: { filters: MarketplaceFilters; signedIn: boolean; suggestedName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(suggestedName);
  const [alerts, setAlerts] = useState(true);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!signedIn) return <Button variant="secondary" size="sm" onClick={() => router.push("/login?next=/cars")}><BellPlus /> Save search</Button>;
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setDone(false); setError(null); } }}>
      <DialogTrigger asChild><Button variant="secondary" size="sm"><BellPlus /> Save search</Button></DialogTrigger>
      <DialogContent title="Save this search" description="Find it again from your dashboard, and optionally get emailed when matching cars are listed.">
        {done ? (
          <p className="flex items-center gap-2 text-sm text-success"><Check className="size-4" /> Search saved.</p>
        ) : (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); start(async () => {
            const { page: _p, ...rest } = filters; void _p;
            const res = await saveSearch(name, rest as Record<string, unknown>, alerts);
            if (res.ok) setDone(true); else setError(res.error);
          }); }}>
            <div><Label htmlFor="ss-name">Name</Label><Input id="ss-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required /></div>
            <Checkbox checked={alerts} onChange={(e) => setAlerts(e.target.checked)} label="Email me when new matching vehicles are listed" description="You can turn this off at any time." />
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button type="submit" disabled={pending} className="w-full">Save search</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
