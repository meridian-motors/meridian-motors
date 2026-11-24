import { describe, expect, it } from "vitest";
import { valueVehicle, pricePositioning, priceReviewSignal, roundAdvertised, type ComparableInput, type SubjectVehicle } from "./engine";
import { calculateSaleFee, validateFeeTiers, DEFAULT_FEE_TIERS } from "./fees";

const now = new Date("2026-11-24T12:00:00Z");
const subject: SubjectVehicle = { make: "Volkswagen", model: "Golf", year: 2019, mileage: 42000, fuel_type: "petrol", transmission: "automatic", condition: "very_good", service_history: "full" };
const comp = (i: number, over: Partial<ComparableInput> = {}): ComparableInput => ({
  source_provider: "meridian_completed_sale", external_reference: `tx-${i}`, make: "Volkswagen", model: "Golf", year: 2019,
  mileage: 40000 + i * 1000, fuel_type: "petrol", transmission: "automatic", condition: "very_good", price: 13000 + i * 150,
  price_type: "sold", source_date: "2026-10-01", ...over,
});

describe("Fast Sale engine", () => {
  it("returns insufficient_data (and no prices) when evidence is thin", () => {
    const r = valueVehicle(subject, [comp(1), comp(2)], { now });
    expect(r.status).toBe("insufficient_data");
    expect(r.recommended_asking_price).toBeNull();
    expect(r.fast_sale_price).toBeNull();
    expect(r.market_value_min).toBeNull();
    expect(r.data_limitations[0]).toMatch(/at least 3/);
  });

  it("returns insufficient_data with zero comparables — never fabricates", () => {
    const r = valueVehicle(subject, [], { now });
    expect(r.status).toBe("insufficient_data");
    expect(r.comparables).toHaveLength(0);
  });

  it("produces a consistent range, asking price and fast-sale price from real comparables", () => {
    const r = valueVehicle(subject, Array.from({ length: 8 }, (_, i) => comp(i)), { now });
    expect(r.status).toBe("completed");
    expect(r.market_value_min!).toBeLessThanOrEqual(r.market_value_max!);
    expect(r.fast_sale_price!).toBeLessThan(r.recommended_asking_price!);
    expect(r.recommended_asking_price!).toBeGreaterThan(12000);
    expect(r.recommended_asking_price!).toBeLessThan(16000);
    expect(r.confidence_score!).toBeGreaterThan(0);
    expect(r.confidence_score!).toBeLessThanOrEqual(0.92);
    expect(r.comparables.every((c) => c.external_reference.startsWith("tx-"))).toBe(true);
    expect(r.explanation).toMatch(/not a guaranteed sale price/);
  });

  it("excludes comparables of a different model, fuel, transmission, year band or age", () => {
    const r = valueVehicle(subject, [
      comp(1), comp(2), comp(3),
      comp(4, { model: "Polo" }), comp(5, { fuel_type: "diesel" }), comp(6, { transmission: "manual" }),
      comp(7, { year: 2014 }), comp(8, { source_date: "2024-01-01" }), comp(9, { mileage: 150000 }),
    ], { now });
    expect(r.comparables).toHaveLength(3);
    const reasons = r.excluded.map((e) => e.reason);
    expect(reasons).toEqual(expect.arrayContaining(["different make/model", "different fuel type", "different transmission", "outside year range", "older than 12 months", "outside mileage range"]));
  });

  it("removes extreme price outliers", () => {
    const comps = Array.from({ length: 7 }, (_, i) => comp(i));
    comps.push(comp(20, { price: 60000, mileage: 41000 }));
    const r = valueVehicle(subject, comps, { now });
    expect(r.excluded.some((e) => e.reason === "price outlier")).toBe(true);
    expect(r.market_value_max!).toBeLessThan(20000);
  });

  it("adjusts for mileage: a higher-mileage subject values lower", () => {
    const comps = Array.from({ length: 6 }, (_, i) => comp(i));
    const low = valueVehicle({ ...subject, mileage: 38000 }, comps, { now });
    const high = valueVehicle({ ...subject, mileage: 52000 }, comps, { now });
    expect(high.recommended_asking_price!).toBeLessThan(low.recommended_asking_price!);
  });

  it("classifies price positioning", () => {
    const r = valueVehicle(subject, Array.from({ length: 8 }, (_, i) => comp(i)), { now });
    expect(pricePositioning(r.fast_sale_price!, r)).toBe("fast_sale");
    expect(pricePositioning(r.recommended_asking_price!, r)).toBe("market");
    expect(pricePositioning(r.market_value_max! + 2000, r)).toBe("above_market");
  });
});

describe("price review signal (market intelligence)", () => {
  it("suggests a review but never below the authorised minimum", () => {
    const s = priceReviewSignal({ daysListed: 30, views: 400, enquiries: 0, saves: 3, askingPrice: 14000, fastSalePrice: 12500, minimumAuthorised: 13000 });
    expect(s.recommend).toBe(true);
    expect(s.suggestedPrice).toBe(13000);
  });
  it("does not suggest anything when listing is performing", () => {
    const s = priceReviewSignal({ daysListed: 10, views: 300, enquiries: 6, saves: 9, askingPrice: 14000, fastSalePrice: 12500 });
    expect(s.recommend).toBe(false);
  });
  it("does not suggest when the minimum equals the asking price", () => {
    const s = priceReviewSignal({ daysListed: 40, views: 10, enquiries: 0, saves: 0, askingPrice: 13000, fastSalePrice: 12500, minimumAuthorised: 13000 });
    expect(s.recommend).toBe(false);
  });
});

describe("advertised price rounding", () => {
  it("rounds to UK-style prices", () => {
    expect(roundAdvertised(8512)).toBe(8495);
    expect(roundAdvertised(12480)).toBe(12495);
    expect(roundAdvertised(12260)).toBe(12250);
  });
});

describe("sale fees", () => {
  it("uses configurable tiers with inclusive bounds", () => {
    expect(calculateSaleFee(1999)).toBe(0);
    expect(calculateSaleFee(2000)).toBe(149);
    expect(calculateSaleFee(4999)).toBe(149);
    expect(calculateSaleFee(8600)).toBe(199);
    expect(calculateSaleFee(19999)).toBe(249);
    expect(calculateSaleFee(34999)).toBe(299);
    expect(calculateSaleFee(90000)).toBe(399);
  });
  it("validates tier configuration", () => {
    expect(validateFeeTiers(DEFAULT_FEE_TIERS)).toBeNull();
    expect(validateFeeTiers([{ min: 0, max: 5000, fee: 1 }, { min: 4000, max: null, fee: 2 }])).toMatch(/overlap/);
    expect(validateFeeTiers([{ min: 0, max: null, fee: 1 }, { min: 4000, max: 5000, fee: 2 }])).toMatch(/open-ended/);
  });
});
