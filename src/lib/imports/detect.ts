/** Spreadsheet column detection for vehicle imports. */
export const IMPORT_FIELDS = [
  "registration", "vin", "make", "model", "derivative", "year", "mileage", "price", "fuel", "transmission",
  "body", "colour", "engine_size", "doors", "seats", "location", "postcode", "description", "condition", "service_history",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const REQUIRED_FIELDS: ImportField[] = ["make", "model", "year", "mileage"];

export const FIELD_LABELS: Record<ImportField, string> = {
  registration: "Registration", vin: "VIN", make: "Make", model: "Model", derivative: "Derivative / trim", year: "Year",
  mileage: "Mileage", price: "Price", fuel: "Fuel", transmission: "Transmission", body: "Body type", colour: "Colour",
  engine_size: "Engine size", doors: "Doors", seats: "Seats", location: "Location", postcode: "Postcode",
  description: "Description", condition: "Condition", service_history: "Service history",
};

const SYNONYMS: Record<ImportField, string[]> = {
  registration: ["registration", "reg", "regno", "reg no", "reg number", "registration number", "vrm", "number plate", "plate", "vehicle registration"],
  vin: ["vin", "chassis", "chassis number", "vehicle identification number"],
  make: ["make", "manufacturer", "brand", "marque"],
  model: ["model", "model name", "range"],
  derivative: ["derivative", "variant", "trim", "version", "spec", "model variant"],
  year: ["year", "reg year", "registration year", "model year", "yr", "year of manufacture", "first registered", "date first registered", "manufactured"],
  mileage: ["mileage", "miles", "odometer", "odo", "current mileage", "milage"],
  price: ["price", "asking price", "retail price", "sale price", "list price", "advertised price", "price gbp", "price £", "amount"],
  fuel: ["fuel", "fuel type", "fueltype", "power", "engine type"],
  transmission: ["transmission", "gearbox", "gear box", "trans", "gears"],
  body: ["body", "body type", "bodystyle", "body style", "type", "vehicle type"],
  colour: ["colour", "color", "paint", "exterior colour", "exterior color"],
  engine_size: ["engine size", "engine", "engine cc", "cc", "capacity", "engine capacity", "displacement"],
  doors: ["doors", "door count", "no of doors", "number of doors"],
  seats: ["seats", "seat count", "no of seats", "number of seats", "seating"],
  location: ["location", "town", "city", "branch", "site"],
  postcode: ["postcode", "post code", "zip", "postal code"],
  description: ["description", "notes", "comments", "details", "advert text", "advert", "summary"],
  condition: ["condition", "grade", "vehicle condition"],
  service_history: ["service history", "history", "service", "fsh"],
};

const normHeader = (h: string) => h.toLowerCase().replace(/[£$]/g, " ").replace(/[_\-./()]+/g, " ").replace(/\s+/g, " ").trim();

export interface ColumnDetection {
  mapping: Partial<Record<ImportField, string>>;  // field → header
  confidence: Partial<Record<ImportField, number>>;
  unmapped: string[];
  missingRequired: ImportField[];
}

export function detectColumns(headers: string[]): ColumnDetection {
  const mapping: Partial<Record<ImportField, string>> = {};
  const confidence: Partial<Record<ImportField, number>> = {};
  const used = new Set<string>();

  const candidates: { field: ImportField; header: string; score: number }[] = [];
  for (const header of headers) {
    const h = normHeader(header);
    if (!h) continue;
    for (const field of IMPORT_FIELDS) {
      for (const syn of SYNONYMS[field]) {
        let score = 0;
        if (h === syn) score = 1;
        else if (h.startsWith(syn + " ") || h.endsWith(" " + syn)) score = 0.8;
        else if (syn.length > 3 && h.includes(syn)) score = 0.6;
        if (score > 0) candidates.push({ field, header, score });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  for (const c of candidates) {
    if (mapping[c.field] || used.has(c.header)) continue;
    mapping[c.field] = c.header;
    confidence[c.field] = c.score;
    used.add(c.header);
  }
  return {
    mapping,
    confidence,
    unmapped: headers.filter((h) => !used.has(h)),
    missingRequired: REQUIRED_FIELDS.filter((f) => !mapping[f]),
  };
}
