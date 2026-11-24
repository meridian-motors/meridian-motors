export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export const ok = <T,>(data?: T, message?: string): ActionResult<T> => ({ ok: true, data, message });
export const fail = (error: string, fieldErrors?: Record<string, string>): ActionResult<never> => ({ ok: false, error, fieldErrors });

/** Convert a Zod error into a flat field → message map. */
export function zodFieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = i.path.map(String).join(".");
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

/** Map Postgres/PostgREST errors to safe user-facing messages. */
export function dbErrorMessage(error: { code?: string; message?: string } | null | undefined, fallback = "Something went wrong. Please try again.") {
  if (!error) return fallback;
  // Our own business-rule exceptions are written for users (raised with explicit codes).
  if (error.code && ["42501", "23514", "22023", "P0002", "54000"].includes(error.code) && error.message) return error.message;
  if (error.code === "23505") return "This record already exists (duplicate).";
  if (error.code === "23503") return "A related record could not be found.";
  return fallback;
}
