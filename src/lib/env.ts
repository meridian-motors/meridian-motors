/**
 * Central, typed access to configuration. Every secret is server-only and read
 * from environment variables. Integrations report "configured" only when their
 * credentials exist — the UI must show an unavailable state otherwise.
 */
const read = (key: string) => {
  const v = process.env[key];
  return v && v.trim() !== "" ? v.trim() : undefined;
};

export const publicEnv = {
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, ""),
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN || "",
};

export const isSupabaseConfigured = Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);

export function serverEnv() {
  return {
    supabaseServiceRoleKey: read("SUPABASE_SERVICE_ROLE_KEY"),
    anthropicApiKey: read("ANTHROPIC_API_KEY"),
    anthropicModel: read("ANTHROPIC_MODEL") ?? "claude-opus-5-5",
    stripeSecretKey: read("STRIPE_SECRET_KEY"),
    stripeWebhookSecret: read("STRIPE_WEBHOOK_SECRET"),
    resendApiKey: read("RESEND_API_KEY"),
    emailFrom: read("EMAIL_FROM") ?? "Meridian Motors <no-reply@meridianmotors.co.uk>",
    dvlaApiKey: read("DVLA_VES_API_KEY"),
    dvlaApiUrl: read("DVLA_VES_API_URL") ?? "https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles",
    cronSecret: read("CRON_SECRET"),
    geocodingEnabled: read("GEOCODING_ENABLED") !== "false",
    sessionHashSalt: read("SESSION_HASH_SALT") ?? "meridian-dev-salt",
  };
}

export type Integration = "supabase_admin" | "ai" | "stripe" | "email" | "dvla";

export function integrationStatus(): Record<Integration, boolean> {
  const env = serverEnv();
  return {
    supabase_admin: Boolean(env.supabaseServiceRoleKey && isSupabaseConfigured),
    ai: Boolean(env.anthropicApiKey),
    stripe: Boolean(env.stripeSecretKey && env.stripeWebhookSecret),
    email: Boolean(env.resendApiKey),
    dvla: Boolean(env.dvlaApiKey),
  };
}
