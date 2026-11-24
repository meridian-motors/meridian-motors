import { describe, expect, it } from "vitest";
import { detectColumns } from "./detect";
import { mapRow, markDuplicates, summarisePreview, normaliseFuel, normaliseTransmission } from "./validate";
import { parseCsv } from "./parse";

describe("column detection", () => {
  it("detects common dealer spreadsheet headings", () => {
    const d = detectColumns(["Reg No", "Manufacturer", "Model", "Variant", "Year of Manufacture", "Odometer", "Asking Price (£)", "Fuel Type", "Gearbox", "Colour", "Branch", "Notes"]);
    expect(d.mapping).toMatchObject({ registration: "Reg No", make: "Manufacturer", model: "Model", derivative: "Variant", year: "Year of Manufacture",
      mileage: "Odometer", price: "Asking Price (£)", fuel: "Fuel Type", transmission: "Gearbox", colour: "Colour", location: "Branch", description: "Notes" });
    expect(d.missingRequired).toEqual([]);
  });
  it("reports missing required fields for manual mapping", () => {
    const d = detectColumns(["Column A", "Column B", "Make"]);
    expect(d.missingRequired).toEqual(["model", "year", "mileage"]);
    expect(d.unmapped).toEqual(["Column A", "Column B"]);
  });
});

describe("row mapping & validation", () => {
  const mapping = { registration: "Reg", make: "Make", model: "Model", year: "Year", mileage: "Miles", price: "Price", fuel: "Fuel", transmission: "Gearbox", postcode: "Postcode" } as const;
  it("normalises values", () => {
    const { data, errors } = mapRow({ Reg: "ab12 cde", Make: "Ford", Model: "Focus", Year: "2019-03-01", Miles: "42,000 miles", Price: "£8,995", Fuel: "Petrol", Gearbox: "Auto", Postcode: "sw1a1aa" }, mapping);
    expect(errors).toEqual([]);
    expect(data).toMatchObject({ registration_number: "AB12CDE", year: 2019, mileage: 42000, asking_price: 8995, fuel_type: "petrol", transmission: "automatic", postcode: "SW1A 1AA" });
  });
  it("reports every problem instead of discarding the row", () => {
    const { errors } = mapRow({ Reg: "!!", Make: "", Model: "Focus", Year: "1890", Miles: "lots", Price: "-5", Fuel: "steam", Gearbox: "", Postcode: "nope" }, mapping);
    expect(errors).toEqual(expect.arrayContaining(["Make is missing", 'Year "1890" is not valid', 'Mileage "lots" is not valid', 'Price "-5" is not valid',
      'Fuel "steam" not recognised', 'Postcode "nope" is not valid']));
  });
  it("normalises fuel and transmission synonyms", () => {
    expect(normaliseFuel("Petrol/Electric")).toBe("hybrid");
    expect(normaliseFuel("PHEV")).toBe("plug_in_hybrid");
    expect(normaliseFuel("2.0 TDI")).toBe("diesel");
    expect(normaliseTransmission("DSG")).toBe("semi_automatic");
    expect(normaliseTransmission("Manual")).toBe("manual");
    expect(normaliseTransmission("CVT")).toBe("automatic");
  });
});

describe("duplicate detection", () => {
  it("flags in-file and existing duplicates", () => {
    const base = (n: number, reg: string) => ({ rowNumber: n, raw: {}, errors: [], data: { ...mapRow({}, {}).data, registration_number: reg } });
    const rows = markDuplicates([base(2, "AB12CDE"), base(3, "AB12CDE"), base(4, "XY99ZZZ"), base(5, "NEW1")], { registrations: new Set(["XY99ZZZ"]), vins: new Set() });
    expect(rows.map((r) => r.duplicateOf)).toEqual([null, "Same registration as row 2", "Existing vehicle with registration XY99ZZZ", null]);
    const s = summarisePreview(rows);
    expect(s.duplicates).toBe(2);
  });
});

describe("CSV parsing", () => {
  it("handles BOM, quoted commas and blank lines; scales to 600 rows", () => {
    const lines = ["﻿Make,Model,Year,Mileage,Description"];
    for (let i = 0; i < 600; i++) lines.push(`Ford,Focus,2019,${10000 + i},"Clean, tidy car"`);
    lines.push("", "");
    const p = parseCsv(lines.join("\n"));
    expect(p.headers).toEqual(["Make", "Model", "Year", "Mileage", "Description"]);
    expect(p.rows).toHaveLength(600);
    expect(p.rows[0].Description).toBe("Clean, tidy car");
  });
});
