import { describe, expect, it } from "vitest";
import { parseNaturalQuery } from "./parse-natural";
import { parseFilters, filtersToQuery } from "./filters";

describe("natural language search fallback", () => {
  it("parses the canonical example", () => {
    const { filters } = parseNaturalQuery("Find me a comfortable automatic petrol car under £12,000 with less than 60,000 miles.");
    expect(filters).toMatchObject({ maxPrice: 12000, maxMileage: 60000, fuel: ["petrol"], transmission: ["automatic", "semi_automatic"] });
  });
  it("handles k-suffixes, makes, body types and years", () => {
    const { filters } = parseNaturalQuery("vw estate diesel 2018 or newer under 15k near Leeds");
    expect(filters).toMatchObject({ make: "Volkswagen", body: ["estate"], fuel: ["diesel"], minYear: 2018, maxPrice: 15000, location: "Leeds" });
  });
  it("does not confuse mileage with price", () => {
    const { filters } = parseNaturalQuery("BMW under 40k miles");
    expect(filters.maxMileage).toBe(40000);
    expect(filters.maxPrice).toBeUndefined();
  });
});

describe("URL filters", () => {
  it("round-trips and ignores junk", () => {
    const f = parseFilters({ make: "Ford", maxPrice: "12000", fuel: "petrol,diesel", sort: "price_asc", page: "2", minYear: "abc", body: "spaceship" });
    expect(f).toMatchObject({ make: "Ford", maxPrice: 12000, fuel: ["petrol", "diesel"], sort: "price_asc", page: 2 });
    expect(f.minYear).toBeUndefined();
    expect(f.body).toBeUndefined();
    expect(filtersToQuery(f)).toBe("make=Ford&maxPrice=12000&fuel=petrol%2Cdiesel&sort=price_asc&page=2");
  });
});
