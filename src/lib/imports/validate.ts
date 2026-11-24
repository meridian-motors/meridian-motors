import type { ImportField } from "./detect";

export interface MappedVehicle {
  registration_number: string | null;
  vin: string | null;
  make: string | null;
  model: string | null;
  derivative: string | null;
  year: number | null;
  mileage: number | null;
  asking_price: number | null;
  fuel_type: string | null;
  transmission: string | null;
  body_type: string | null;
  colour: string | null;
  engine_size: number | null;
  doors: number | null;
  seats: number | null;
  location: string | null;
  postcode: string | null;
  description: string | null;
  condition: string | null;
  service_history: string | null;
}

const str = (v: unknown) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" || /^(n\/?a|null|none|-)$/i.test(s) ? null : s;
};
const toNumber = (v: unknown) => {
  const s = str(v);
  if (s == null) return null;
  const cleaned = s.replace(/[£,\s]|miles?|mi\b|gbp/gi, "");
  if (!/^-?\d+(\.\d+)?k?$/i.test(cleaned)) return NaN;
  const n = /k$/i.test(cleaned) ? parseFloat(cleaned) * 1000 : parseFloat(cleaned);
  return n;
};

export function normaliseFuel(v: unknown): string | null | undefined {
  const s = str(v)?.toLowerCase();
  if (!s) return null;
  if (/plug|phev/.test(s)) return "plug_in_hybrid";
  if (/hybrid|hev|petrol\s*\/\s*electric|electric\s*\/\s*petrol|mhev/.test(s)) return "hybrid";
  if (/^(electric|ev|bev|battery)/.test(s)) return "electric";
  if (/diesel|tdi|cdi|dci|hdi/.test(s)) return "diesel";
  if (/petrol|gasoline|unleaded|tsi|tfsi/.test(s)) return "petrol";
  if (/lpg|bi.?fuel/.test(s)) return "lpg";
  return undefined;
}
export function normaliseTransmission(v: unknown): string | null | undefined {
  const s = str(v)?.toLowerCase();
  if (!s) return null;
  if (/semi|dsg|dct|tiptronic|paddle|robot/.test(s)) return "semi_automatic";
  if (/^a(uto)?(matic)?$|auto|cvt|^at$/.test(s)) return "automatic";
  if (/man|^mt$|^m$/.test(s)) return "manual";
  return undefined;
}
export function normaliseBody(v: unknown): string | null | undefined {
  const s = str(v)?.toLowerCase();
  if (!s) return null;
  const map: [RegExp, string][] = [[/hatch/, "hatchback"], [/saloon|sedan/, "saloon"], [/estate|touring|avant|wagon|sportwagen/, "estate"],
    [/suv|4x4|crossover/, "suv"], [/coupe|coupé/, "coupe"], [/convertible|cabrio|roadster/, "convertible"], [/mpv|people/, "mpv"],
    [/pick.?up/, "pickup"], [/van|panel/, "van"]];
  for (const [re, val] of map) if (re.test(s)) return val;
  return "other";
}
export function normaliseCondition(v: unknown): string | null | undefined {
  const s = str(v)?.toLowerCase().replace(/\s+/g, "_");
  if (!s) return null;
  if (["excellent", "very_good", "good", "fair", "poor"].includes(s)) return s;
  if (/^(a|5)$/.test(s)) return "excellent";
  return undefined;
}
export function normaliseServiceHistory(v: unknown): string | null | undefined {
  const s = str(v)?.toLowerCase();
  if (!s) return null;
  if (/^(full|fsh|fmdsh|full dealer|yes)/.test(s)) return "full";
  if (/part/.test(s)) return "partial";
  if (/^(none|no)$/.test(s)) return "none";
  return "unknown";
}
export const normaliseRegistration = (v: unknown) => str(v)?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? null;
export const normalisePostcode = (v: unknown) => {
  const s = str(v)?.toUpperCase().replace(/\s+/g, "");
  if (!s) return null;
  return s.replace(/^(.+)([0-9][A-Z]{2})$/, "$1 $2");
};

const UK_POSTCODE = /^[A-Z]{1,2}[0-9][A-Z0-9]? [0-9][A-Z]{2}$/;
const UK_REG = /^[A-Z0-9]{2,8}$/;
const VIN = /^[A-HJ-NPR-Z0-9]{17}$/;

export function mapRow(raw: Record<string, unknown>, mapping: Partial<Record<ImportField, string>>) {
  const get = (f: ImportField) => (mapping[f] ? raw[mapping[f]!] : undefined);
  const errors: string[] = [];
  const currentYear = new Date().getUTCFullYear();

  let year = toNumber(get("year"));
  // Accept dates such as 2019-03-01 or 01/03/2019
  if (Number.isNaN(year)) {
    const m = String(get("year") ?? "").match(/(19[5-9]\d|20\d{2})/);
    year = m ? Number(m[1]) : NaN;
  }
  const mileage = toNumber(get("mileage"));
  const price = toNumber(get("price"));
  const engine = toNumber(get("engine_size"));
  const doors = toNumber(get("doors"));
  const seats = toNumber(get("seats"));

  const fuel = normaliseFuel(get("fuel"));
  const transmission = normaliseTransmission(get("transmission"));
  const condition = normaliseCondition(get("condition"));

  const out: MappedVehicle = {
    registration_number: normaliseRegistration(get("registration")),
    vin: str(get("vin"))?.toUpperCase().replace(/\s/g, "") ?? null,
    make: str(get("make")),
    model: str(get("model")),
    derivative: str(get("derivative")),
    year: Number.isFinite(year) ? Math.trunc(year as number) : null,
    mileage: Number.isFinite(mileage) ? Math.round(mileage as number) : null,
    asking_price: Number.isFinite(price) ? Math.round(price as number) : null,
    fuel_type: fuel ?? null,
    transmission: transmission ?? null,
    body_type: normaliseBody(get("body")) ?? null,
    colour: str(get("colour")),
    engine_size: Number.isFinite(engine) ? Math.round((engine as number) < 20 ? (engine as number) * 1000 : (engine as number)) : null,
    doors: Number.isFinite(doors) ? Math.round(doors as number) : null,
    seats: Number.isFinite(seats) ? Math.round(seats as number) : null,
    location: str(get("location")),
    postcode: normalisePostcode(get("postcode")),
    description: str(get("description")),
    condition: condition ?? null,
    service_history: normaliseServiceHistory(get("service_history")) ?? null,
  };

  if (!out.make) errors.push("Make is missing");
  if (!out.model) errors.push("Model is missing");
  if (get("year") == null || str(get("year")) == null) errors.push("Year is missing");
  else if (out.year == null || out.year < 1950 || out.year > currentYear + 1) errors.push(`Year "${String(get("year"))}" is not valid`);
  if (str(get("mileage")) == null) errors.push("Mileage is missing");
  else if (out.mileage == null || out.mileage < 0 || out.mileage > 1500000) errors.push(`Mileage "${String(get("mileage"))}" is not valid`);
  if (str(get("price")) != null && (out.asking_price == null || out.asking_price < 100 || out.asking_price > 5000000)) errors.push(`Price "${String(get("price"))}" is not valid`);
  if (out.registration_number && !UK_REG.test(out.registration_number)) errors.push(`Registration "${String(get("registration"))}" is not a valid UK format`);
  if (out.vin && !VIN.test(out.vin)) errors.push("VIN must be 17 characters (no I, O or Q)");
  if (out.postcode && !UK_POSTCODE.test(out.postcode)) errors.push(`Postcode "${String(get("postcode"))}" is not valid`);
  if (fuel === undefined) errors.push(`Fuel "${String(get("fuel"))}" not recognised`);
  if (transmission === undefined) errors.push(`Transmission "${String(get("transmission"))}" not recognised`);
  if (condition === undefined) errors.push(`Condition "${String(get("condition"))}" not recognised (use excellent, very good, good, fair or poor)`);
  if (out.doors != null && (out.doors < 1 || out.doors > 7)) errors.push("Doors must be between 1 and 7");
  if (out.seats != null && (out.seats < 1 || out.seats > 12)) errors.push("Seats must be between 1 and 12");
  if (out.make && out.make.length > 40) errors.push("Make is too long");
  if (out.model && out.model.length > 60) errors.push("Model is too long");
  if (out.description && out.description.length > 6000) errors.push("Description is too long (max 6,000 characters)");

  return { data: out, errors };
}

export interface PreviewRow { rowNumber: number; raw: Record<string, unknown>; data: MappedVehicle; errors: string[]; duplicateOf: string | null }

/** Flags duplicates within the file and against existing live registrations / VINs. */
export function markDuplicates(rows: Omit<PreviewRow, "duplicateOf">[], existing: { registrations: Set<string>; vins: Set<string> }): PreviewRow[] {
  const seenReg = new Map<string, number>();
  const seenVin = new Map<string, number>();
  return rows.map((r) => {
    let duplicateOf: string | null = null;
    const reg = r.data.registration_number, vin = r.data.vin;
    if (reg && existing.registrations.has(reg)) duplicateOf = `Existing vehicle with registration ${reg}`;
    else if (vin && existing.vins.has(vin)) duplicateOf = `Existing vehicle with VIN ${vin}`;
    else if (reg && seenReg.has(reg)) duplicateOf = `Same registration as row ${seenReg.get(reg)}`;
    else if (vin && seenVin.has(vin)) duplicateOf = `Same VIN as row ${seenVin.get(vin)}`;
    if (reg && !seenReg.has(reg)) seenReg.set(reg, r.rowNumber);
    if (vin && !seenVin.has(vin)) seenVin.set(vin, r.rowNumber);
    return { ...r, duplicateOf };
  });
}

export function summarisePreview(rows: PreviewRow[]) {
  const missing: Record<string, number> = {};
  for (const r of rows) for (const e of r.errors) if (/missing/.test(e)) missing[e] = (missing[e] ?? 0) + 1;
  return {
    total: rows.length,
    valid: rows.filter((r) => r.errors.length === 0 && !r.duplicateOf).length,
    invalid: rows.filter((r) => r.errors.length > 0).length,
    duplicates: rows.filter((r) => r.duplicateOf).length,
    missingFields: missing,
  };
}
