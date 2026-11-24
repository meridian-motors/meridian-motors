/**
 * Deterministic natural-language → filter parser. Used as the fallback when the
 * AI service is not configured, and as a sanity baseline for AI output.
 * It only produces FILTERS; results always come from real listings.
 */
import type { MarketplaceFilters } from "@/lib/types";
import { POPULAR_MAKES } from "@/lib/constants";

const num = (s: string) => {
  const cleaned = s.replace(/[£,\s]/g, "").toLowerCase();
  return cleaned.endsWith("k") ? Math.round(parseFloat(cleaned) * 1000) : Math.round(parseFloat(cleaned));
};

export function parseNaturalQuery(input: string, knownMakes: string[] = POPULAR_MAKES): { filters: MarketplaceFilters; understood: string[] } {
  const text = ` ${input.toLowerCase().replace(/\s+/g, " ")} `;
  const f: MarketplaceFilters = {};
  const understood: string[] = [];

  // Price: "under £12,000", "below 12k", "up to £8000", "max £10k", "budget of 9000"
  const maxPrice = text.match(/(?:under|below|less than|up to|max(?:imum)?|budget(?: of)?|no more than|<)\s*£?\s*(\d[\d,]*(?:\.\d+)?k?)(?![\d,.k])(?!\s*(?:miles|mi\b|mileage))/);
  if (maxPrice) { f.maxPrice = num(maxPrice[1]); understood.push(`Price under £${f.maxPrice.toLocaleString("en-GB")}`); }
  const minPrice = text.match(/(?:over|above|more than|at least|from|min(?:imum)?)\s*£\s*(\d[\d,]*k?)/);
  if (minPrice) { f.minPrice = num(minPrice[1]); understood.push(`Price over £${f.minPrice.toLocaleString("en-GB")}`); }
  const between = text.match(/between\s*£?\s*(\d[\d,]*k?)\s*(?:and|-|to)\s*£?\s*(\d[\d,]*k?)(?![\d,k])(?!\s*miles)/);
  if (between) { f.minPrice = num(between[1]); f.maxPrice = num(between[2]); understood.push(`Price £${f.minPrice.toLocaleString("en-GB")}–£${f.maxPrice.toLocaleString("en-GB")}`); }

  // Mileage: "less than 60,000 miles", "under 60k miles", "low mileage"
  const miles = text.match(/(?:under|below|less than|fewer than|up to|max(?:imum)?|<)\s*(\d[\d,]*k?)\s*(?:miles|mi\b|mileage)/);
  if (miles) { f.maxMileage = num(miles[1]); understood.push(`Under ${f.maxMileage.toLocaleString("en-GB")} miles`); }
  else if (/low mileage|low miles/.test(text)) { f.maxMileage = 30000; understood.push("Low mileage (under 30,000)"); }

  // Year: "2018 or newer", "newer than 2017", "after 2019", "from 2020"
  const yearMin = text.match(/(?:(20\d{2}|19\d{2})\s*(?:or newer|onwards|\+|or later))|(?:(?:newer than|after|since|from)\s*(20\d{2}|19\d{2}))/);
  if (yearMin) { f.minYear = Number(yearMin[1] ?? yearMin[2]); understood.push(`${f.minYear} or newer`); }

  // Fuel / transmission / body
  const fuels: [RegExp, NonNullable<MarketplaceFilters["fuel"]>[number]][] = [[/\bplug.?in\b|\bphev\b/, "plug_in_hybrid"], [/\bhybrid\b/, "hybrid"], [/\belectric\b|\bev\b/, "electric"], [/\bdiesel\b/, "diesel"], [/\bpetrol\b/, "petrol"]];
  for (const [re, v] of fuels) if (re.test(text) && !(v === "hybrid" && f.fuel?.includes("plug_in_hybrid"))) (f.fuel ??= []).push(v);
  if (f.fuel?.length) understood.push(`Fuel: ${f.fuel.join(", ").replace(/_/g, "-")}`);
  if (/\bautomatic\b|\bauto\b/.test(text)) { f.transmission = ["automatic", "semi_automatic"]; understood.push("Automatic"); }
  else if (/\bmanual\b/.test(text)) { f.transmission = ["manual"]; understood.push("Manual"); }
  const bodies: [RegExp, NonNullable<MarketplaceFilters["body"]>[number]][] = [[/\bsuv\b|\b4x4\b|crossover/, "suv"], [/hatch/, "hatchback"], [/\bestate\b/, "estate"], [/saloon|sedan/, "saloon"],
    [/coupe|coupé/, "coupe"], [/convertible|cabrio/, "convertible"], [/\bmpv\b|people carrier|7.?seat/, "mpv"], [/\bvan\b/, "van"], [/pick.?up/, "pickup"]];
  for (const [re, v] of bodies) if (re.test(text)) (f.body ??= []).push(v);
  if (/family car/.test(text) && !f.body) { f.body = ["estate", "suv", "mpv", "hatchback"]; }
  if (f.body?.length) understood.push(`Body: ${f.body.join(", ")}`);

  // Make
  for (const make of [...knownMakes].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`\\b${make.toLowerCase().replace(/[-\s]/g, "[-\\s]?")}\\b`);
    if (re.test(text) || (make === "Volkswagen" && /\bvw\b/.test(text)) || (make === "Mercedes-Benz" && /\bmercedes\b/.test(text))) {
      f.make = make; understood.push(`Make: ${make}`); break;
    }
  }

  // Location: "near Manchester", "in Leeds"
  const loc = text.match(/\b(?:near|in|around)\s+([a-z][a-z\s-]{2,30}?)(?=\s(?:under|with|less|below|for|that|and|automatic|manual|petrol|diesel)\b|\s*$)/);
  if (loc) { f.location = loc[1].trim().replace(/\b\w/g, (c) => c.toUpperCase()); understood.push(`Location: ${f.location}`); }

  // Soft preferences become a keyword query for full-text ranking
  const soft = ["comfortable", "economical", "reliable", "sporty", "spacious", "luxury", "practical"].filter((w) => text.includes(w));
  if (/\bcomfortable\b/.test(text) && !f.body) understood.push("Comfort is subjective — showing all body types; refine with filters");
  if (soft.length) f.sort = "relevance";
  f.sort ??= "newest";

  return { filters: f, understood };
}
