import { describe, expect, it } from "vitest";
import { scoreMatch, normaliseWeights, DEFAULT_WEIGHTS, hasMeaningfulPreferences } from "./engine";

const golf = { make: "Volkswagen", model: "Golf", year: 2019, mileage: 42000, asking_price: 13500, fuel_type: "petrol", transmission: "automatic", body_type: "hatchback", specification: ["Apple CarPlay", "Adaptive cruise control"], latitude: 51.5, longitude: -0.12 };

describe("buyer matching", () => {
  it("scores a perfect match highly and explains why", () => {
    const r = scoreMatch({ preferred_makes: ["Volkswagen"], preferred_models: ["Golf"], maximum_budget: 15000, maximum_mileage: 60000,
      preferred_fuel: ["petrol"], preferred_transmission: ["automatic"], desired_features: ["carplay"], latitude: 51.52, longitude: -0.1, max_distance_miles: 30 }, golf);
    expect(r.score).toBeGreaterThan(0.9);
    expect(r.mismatches).toHaveLength(0);
    expect(r.reasons.join(" ")).toMatch(/budget/);
  });

  it("identifies important mismatches", () => {
    const r = scoreMatch({ maximum_budget: 10000, preferred_transmission: ["manual"], maximum_mileage: 30000 }, golf);
    expect(r.score).toBeLessThan(0.5);
    expect(r.mismatches.join(" ")).toMatch(/above your £10,000 budget/);
    expect(r.mismatches.join(" ")).toMatch(/Transmission/);
  });

  it("applies the default 30/25/15/15/10/5 weights", () => {
    expect(DEFAULT_WEIGHTS.budget).toBe(0.3);
    expect(Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    const w = normaliseWeights({ budget: 3, make_model: 1, mileage: 0, location: 0, specification: 0, other: 0 });
    expect(w.budget).toBeCloseTo(0.75);
  });

  it("is neutral (not positive) when there are no preferences", () => {
    const r = scoreMatch({}, golf);
    expect(r.score).toBeCloseTo(0.5);
    expect(hasMeaningfulPreferences({})).toBe(false);
  });

  it("does not accept personal characteristics as inputs", () => {
    // Type-level guarantee: BuyerPreferenceInput only has vehicle preferences.
    const r = scoreMatch({ maximum_budget: 15000, ...( { age: 70, gender: "x" } as object) }, golf);
    expect(Object.keys(r.breakdown).sort()).toEqual(["budget", "location", "make_model", "mileage", "other", "specification"]);
  });
});
