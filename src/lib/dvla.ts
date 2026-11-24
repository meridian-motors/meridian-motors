import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";

/**
 * DVLA Vehicle Enquiry Service (VES).
 * IMPORTANT: a VES lookup returns DVLA-held vehicle details (make, colour, fuel,
 * year, engine capacity, tax and MOT status). It does NOT establish ownership,
 * finance status, write-off status or full vehicle history.
 */
export interface DvlaVehicle {
  registrationNumber: string;
  make?: string;
  colour?: string;
  fuelType?: string;
  yearOfManufacture?: number;
  engineCapacity?: number;
  motStatus?: string;
  motExpiryDate?: string;
  taxStatus?: string;
  taxDueDate?: string;
  monthOfFirstRegistration?: string;
  co2Emissions?: number;
  wheelplan?: string;
}

export type DvlaResult =
  | { status: "success"; vehicle: DvlaVehicle; cached: boolean; lookedUpAt: string }
  | { status: "not_found" | "unavailable" | "rate_limited" | "error" | "invalid"; message: string };

export const normaliseReg = (reg: string) => reg.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function mapDvlaFuel(f?: string) {
  const s = (f ?? "").toUpperCase();
  if (s.includes("HYBRID")) return "hybrid";
  if (s === "ELECTRICITY") return "electric";
  if (s === "DIESEL") return "diesel";
  if (s === "PETROL") return "petrol";
  if (s.includes("GAS")) return "lpg";
  return null;
}

export async function lookupRegistration(rawReg: string, userId: string | null): Promise<DvlaResult> {
  const reg = normaliseReg(rawReg);
  if (!/^[A-Z0-9]{2,8}$/.test(reg)) return { status: "invalid", message: "Enter a valid UK registration number." };
  const env = serverEnv();
  if (!env.dvlaApiKey) return { status: "unavailable", message: "Registration lookup is not configured yet. Please enter your vehicle details manually." };

  const admin = createAdminClient();
  // 24h cache — avoids repeated calls for the same registration
  const { data: cached } = await admin.from("dvla_lookups").select("response, looked_up_at").eq("registration_number", reg).eq("status", "success")
    .gte("looked_up_at", new Date(Date.now() - 86400_000).toISOString()).order("looked_up_at", { ascending: false }).limit(1).maybeSingle();
  if (cached?.response) return { status: "success", vehicle: cached.response as DvlaVehicle, cached: true, lookedUpAt: cached.looked_up_at };

  if (!(await rateLimit(`dvla:${userId ?? "anon"}`, 15, 3600)) || !(await rateLimit("dvla:global", 400, 60))) {
    await admin.from("dvla_lookups").insert({ registration_number: reg, status: "rate_limited", requested_by: userId });
    return { status: "rate_limited", message: "Too many lookups. Please wait a little and try again." };
  }

  try {
    const res = await fetch(env.dvlaApiUrl, {
      method: "POST",
      headers: { "x-api-key": env.dvlaApiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ registrationNumber: reg }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (res.status === 404) {
      await admin.from("dvla_lookups").insert({ registration_number: reg, status: "not_found", requested_by: userId });
      return { status: "not_found", message: "DVLA has no record of that registration. Please check it and try again." };
    }
    if (!res.ok) {
      await admin.from("dvla_lookups").insert({ registration_number: reg, status: "error", error_message: `HTTP ${res.status}`, requested_by: userId });
      return { status: "error", message: "The DVLA service could not be reached. Please enter your details manually." };
    }
    const vehicle = (await res.json()) as DvlaVehicle;
    const { data: row } = await admin.from("dvla_lookups").insert({ registration_number: reg, status: "success", response: vehicle, requested_by: userId })
      .select("looked_up_at").single();
    return { status: "success", vehicle, cached: false, lookedUpAt: row?.looked_up_at ?? new Date().toISOString() };
  } catch (e) {
    await admin.from("dvla_lookups").insert({ registration_number: reg, status: "error", error_message: String(e).slice(0, 300), requested_by: userId });
    return { status: "error", message: "The DVLA service did not respond. Please enter your details manually." };
  }
}
