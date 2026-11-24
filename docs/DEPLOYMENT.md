# Deployment (Supabase + Vercel)

## 1. Supabase project

1. Create a project in the **London (eu-west-2)** region.
2. Link and push migrations from your machine:
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
3. **Auth → URL configuration**: Site URL `https://your-domain`, redirect URL `https://your-domain/auth/callback`.
4. **Auth → Email**: keep "Confirm email" on. Configure custom SMTP (e.g. Resend SMTP) so verification emails come from your domain. Update the email templates to link to `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=...` if you prefer token-hash links.
5. **Settings → API**: confirm "Max rows" (default 1000). The app pages through large reads.
6. Storage buckets (`vehicle-images` public, `vehicle-documents` private, `import-files` private) and their policies are created by migration `0010`.
7. Mark the environment as production so demo data can never be loaded:
   ```sql
   insert into platform_settings (setting_key, setting_value, description)
   values ('site.environment', '"production"', 'Environment marker') on conflict do nothing;
   ```

## 2. Vercel

1. Import the repository; framework preset **Next.js**. `vercel.json` pins the `lhr1` (London) region and defines the cron jobs.
2. Add environment variables from `.env.example` (Production and Preview). Use separate Supabase/Stripe projects for Preview.
3. Set `CRON_SECRET` — Vercel sends it automatically as `Authorization: Bearer` to cron routes.
   - `/api/cron/process-imports` every 5 min (continues large imports in the background)
   - `/api/cron/notifications` every 10 min (delivers queued emails)
   - `/api/cron/maintenance` daily (expires listings, clears rate-limit buckets)
   - Sub-daily schedules require a Vercel Pro plan.
4. Deploy, then provision the first super admin (see SETUP.md) against the production keys from a trusted machine.

## 3. Stripe

1. Add `STRIPE_SECRET_KEY` (start with test mode).
2. Create a webhook endpoint `https://your-domain/api/stripe/webhook` with events:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.succeeded`, `charge.refunded`.
3. Copy the signing secret to `STRIPE_WEBHOOK_SECRET`.
4. Local testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

Meridian only ever collects its own fees and service charges. It never collects or holds the buyer's purchase money for a vehicle.

**When the success fee becomes payable:** when a transaction reaches `completed` — the seller has reported/confirmed the sale **and** a Meridian sales operator has confirmed the handover (`staff_complete_sale`). The fee amount comes from `fees.sale_fee_tiers` at that moment, and a pending payment is created for the seller.

## 4. Resend

Verify your sending domain, then set `RESEND_API_KEY` and `EMAIL_FROM`. Emails include `List-Unsubscribe` headers and an unsubscribe link for non-essential categories.

## 5. DVLA Vehicle Enquiry Service

Apply for an API key at the DVLA developer portal and set `DVLA_VES_API_KEY`. Lookups are cached for 24 hours and rate-limited (15/user/hour, 400/min globally). A lookup does **not** confirm ownership.

## 6. Claude API

Set `ANTHROPIC_API_KEY`. Default model `claude-opus-5-5` with server-side refusal fallback. Every call is logged in `ai_runs` (Admin → AI usage). Use the `ai.enabled` setting as a kill-switch and `ai.daily_user_limit` to cap per-user usage.

## 7. Sentry

Set `NEXT_PUBLIC_SENTRY_DSN`. Cookies, auth headers and request bodies are stripped before sending. For readable stack traces, add `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` and wrap `next.config.ts` with `withSentryConfig`.

## 8. Licensed vehicle-history and comparables providers

Finance, stolen, write-off and mileage checks, and third-party comparable data, need provider contracts. Implement the provider in `src/lib/pricing/providers.ts` (comparables) or record results in `vehicle_checks` (history), and register the provider in `data_providers`. The database rejects comparables from providers that are not enabled.
