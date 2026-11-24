import * as Sentry from "@sentry/nextjs";

export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return; // Sentry is optional until a DSN is configured
  Sentry.init({
    dsn, tracesSampleRate: 0.1, environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
   
    beforeSend(event) {
      // Never send cookies, auth headers or request bodies (may contain personal data).
      if (event.request) { delete event.request.cookies; delete event.request.data; if (event.request.headers) { delete event.request.headers.cookie; delete event.request.headers.authorization; } }
      return event;
    },
  });
}

export const onRequestError = Sentry.captureRequestError;
