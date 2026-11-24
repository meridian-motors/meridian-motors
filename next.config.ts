import type { NextConfig } from "next";

// Accept both naming schemes the Vercel ↔ Supabase integration may use
// (legacy anon/service_role keys and the newer publishable/secret keys).
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");

const supabaseUrl = (() => {
  try {
    return SUPABASE_URL ? new URL(SUPABASE_URL) : undefined;
  } catch {
    return undefined;
  }
})();
// Local Supabase (127.0.0.1 / localhost) cannot be fetched by the image optimiser.
const isLocalSupabase = !!supabaseUrl && ["127.0.0.1", "localhost"].includes(supabaseUrl.hostname);

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Public values only (URL and publishable/anon key) — inlined at build time.
  env: { MM_SUPABASE_URL: SUPABASE_URL, MM_SUPABASE_PUBLIC_KEY: SUPABASE_PUBLIC_KEY, MM_SITE_URL: SITE_URL },
  images: {
    formats: ["image/avif", "image/webp"],
    unoptimized: isLocalSupabase,
    remotePatterns: supabaseUrl
      ? [{ protocol: supabaseUrl.protocol.replace(":", "") as "http" | "https", hostname: supabaseUrl.hostname, port: supabaseUrl.port, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/(dashboard|admin)/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default nextConfig;
