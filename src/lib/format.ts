const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const gbpPence = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2 });
const num = new Intl.NumberFormat("en-GB");

export const formatPrice = (v: number | null | undefined) => (v == null ? "—" : gbp.format(v));
export const formatPence = (v: number | null | undefined) => (v == null ? "—" : gbpPence.format(v / 100));
export const formatNumber = (v: number | null | undefined) => (v == null ? "—" : num.format(v));
export const formatMileage = (v: number | null | undefined) => (v == null ? "—" : `${num.format(v)} miles`);
export const formatEngine = (cc: number | null | undefined) => (cc ? `${(cc / 1000).toFixed(1)}L` : null);
export const formatPercent = (v: number | null | undefined, digits = 0) =>
  v == null ? "—" : `${(v * 100).toFixed(digits)}%`;

export function formatDate(value: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", ...opts }).format(new Date(value));
}
export const formatDateTime = (value: string | Date | null | undefined) =>
  formatDate(value, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function timeAgo(value: string | Date) {
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  if (diff < 60) return "just now";
  const units: [number, string][] = [[60, "minute"], [3600, "hour"], [86400, "day"], [604800, "week"], [2629800, "month"], [31557600, "year"]];
  let chosen: [number, string] = units[0];
  for (const u of units) if (diff >= u[0]) chosen = u;
  const n = Math.floor(diff / chosen[0]);
  return `${n} ${chosen[1]}${n === 1 ? "" : "s"} ago`;
}

export function vehicleName(v: { year?: number | null; make?: string | null; model?: string | null }) {
  return [v.year, v.make, v.model].filter(Boolean).join(" ") || "Untitled vehicle";
}

export function maskRegistration(reg: string | null | undefined) {
  if (!reg) return "—";
  return reg.length <= 3 ? "•••" : `${reg.slice(0, 2)}${"•".repeat(reg.length - 2)}`;
}
