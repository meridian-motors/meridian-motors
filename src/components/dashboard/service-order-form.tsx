"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { orderService } from "@/app/actions/seller";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export function ServiceOrderForm({ serviceId, serviceName, vehicles }: { serviceId: string; serviceName: string; vehicles: { id: string; name: string }[] }) {
  const router = useRouter();
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog onOpenChange={() => setResult(null)}>
      <DialogTrigger asChild><Button variant="secondary" size="sm" className="w-full">Request</Button></DialogTrigger>
      <DialogContent title={serviceName} description="Tell us a little about what you need. No payment is taken now.">
        {result?.ok ? <Alert tone="success">{result.text}</Alert> : (
          <div className="space-y-4">
            {vehicles.length ? <Field label="Vehicle" htmlFor="sv"><Select id="sv" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}<option value="">Not vehicle-specific</option></Select></Field> : null}
            <Field label="Notes" htmlFor="sno"><Textarea id="sno" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} /></Field>
            {result && !result.ok ? <Alert tone="danger">{result.text}</Alert> : null}
            <Button className="w-full" disabled={pending} onClick={() => start(async () => { const r = await orderService(serviceId, vehicleId || null, notes); setResult({ ok: r.ok, text: r.ok ? r.message ?? "Requested" : r.error }); router.refresh(); })}>Request service</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
