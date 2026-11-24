# Architecture

## Overview

```
Browser ──► Next.js (Vercel, lhr1)
             ├─ Server Components  → Supabase (user session, RLS enforced)
             ├─ Server Actions     → validate (Zod) → Supabase RPC / tables (RLS + triggers)
             ├─ Route handlers     → Stripe webhook, cron, CSV exports, analytics events
             └─ Service-role client (server-only) → only after an explicit authorisation
                check, or for system jobs (webhooks, cron, imports, valuations)
Supabase ──► Postgres (business rules in triggers/functions), Auth, Storage
External ──► Claude API · Stripe · Resend · DVLA VES · postcodes.io · Sentry
```

Three interfaces share one codebase:

| Interface | Routes | Chrome |
|---|---|---|
| Public site & marketplace | `/`, `/cars`, `/cars/[slug]`, `/sell`, content & legal pages, auth | `src/app/(site)`, `src/app/(auth)` |
| Customer dashboard (selling **and** buying) | `/dashboard/**` | `src/app/dashboard` |
| Administration | `/admin/**` | `src/app/admin` (server-side staff check in the layout and in every action) |

A person can be both buyer and seller with one account: `sellers` and `buyers` rows are capabilities created on first use (`ensure_seller()` / `ensure_buyer()`).

## Security model (defence in depth)

1. **Database first.** RLS is enabled on every table; anonymous users have *no* table privileges at all. The only public read path for vehicles is the `public_listings` view (published, approved, available, public columns only) and RPCs built on it (`search_listings`, `listing_suggestions`, `marketplace_facets`, `submit_enquiry`, `record_listing_event`).
2. **Triggers enforce business rules** regardless of caller:
   - `guard_profile_privileges` — no self-promotion; only super admins grant admin roles; signup metadata can never set a role.
   - `guard_vehicle_update` / `transition_vehicle_status` — `vehicle_status` changes only through the pipeline function, which validates the transition table and actor (seller vs staff), and writes `vehicle_status_history` (previous, new, user, time, reason, internal notes).
   - `guard_listing` — never below the authorised minimum; staff price changes require seller authorisation; separate seller and Meridian approvals; publication only via the pipeline; content edits reset the other party's approval; published content is locked for sellers.
   - `validate_comparable` / `guard_valuation_completion` — anti-fabrication (see Pricing).
   - `guard_payment` — clients (even admins) cannot set payment status, paid date or Stripe IDs; only the service role (verified webhook) can.
   - `protect_transaction`, `prevent_audit_mutation`, soft-delete guards — completed sales and audit logs are immutable.
3. **Server checks** — `requireStaff()` / `requireAdmin()` in admin layouts/pages (non-staff receive a 404), and a `staff()` gate in every admin server action.
4. **Private data separation** — buyer contact details live in `enquiry_contacts` (buyer + staff only); seller pricing intentions in `vehicle_sale_terms`; internal notes in `vehicle_internal_notes`; status history (with internal notes) is staff-only, sellers get a redacted `vehicle_timeline()`.
5. **Storage** — vehicle photos are in a public bucket under unguessable paths; documents are in a private bucket, served by 120-second signed URLs, and each view is written to the audit log. Uploaded photos are re-encoded in the browser (strips EXIF/GPS).
6. **Abuse controls** — Postgres-backed rate limiting (works across serverless instances) on login, signup, password reset, enquiries, contact form, AI search, DVLA and valuations; honeypots on public forms.
7. **Headers** — HSTS, frame denial, nosniff, referrer policy; dashboards/admin sent with `X-Robots-Tag: noindex`.

`is_service_role()` deliberately reads the JWT role (not `current_user`) because inside `SECURITY DEFINER` functions `current_user` is the function owner — using it would silently disable every guard.

## The sales pipeline

`draft → submitted → awaiting_information → verification_pending → valuation_completed → awaiting_seller_approval → approved_for_publication → published → receiving_enquiries → viewing_arranged → offer_received → sale_agreed → payment_pending → handover_pending → completed`, plus `withdrawn`, `rejected`, `cancelled`.

Allowed transitions live in `vehicle_status_transitions` (mirrored in `src/lib/constants.ts` for the UI). Automatic system transitions: first enquiry → `receiving_enquiries`; staff confirmation of a sale → `completed` (and the fee is raised).

## Fast Sale pricing engine (`src/lib/pricing/engine.ts`)

Deterministic and unit-tested. Inputs are real comparables from **authorised sources only**: Meridian completed sales, Meridian listings, and licensed providers registered in `data_providers`.

1. Eligibility: same make/model/fuel/transmission, ±2 years, mileage window (35% or 10k), ≤12 months old.
2. Adjustment to the subject: ~4.5% per 10k miles, ~7.5% per model year, condition ratio; sold prices ×1.03 to asking-equivalent.
3. Weighting: similarity × recency (90-day half-life), sold prices weighted higher; Tukey outlier removal.
4. Outputs: weighted P25–P75 market range, P50 suggested asking price, fast-sale price at the configurable percentile (default P25, never above 96% of P50), service-history factor, UK-style rounding.
5. Confidence from count, dispersion, similarity and sold share — capped at 92%.
6. Fewer than `pricing.min_comparables` (default 3) → `insufficient_data` with **no prices**.

The database independently refuses to complete a valuation without enough comparables, and refuses comparables that do not reference a real completed Meridian sale (matching price), a real Meridian listing, or an enabled licensed provider.

AI is only used to *word* the explanation; if the AI text contains any £ figure the engine did not produce, it is discarded and the deterministic explanation is kept.

Recommendations (`asking`, `fast_sale`, `price_review`) always need an explicit seller decision. `priceReviewSignal()` (market intelligence) only *suggests* reviews from real listing metrics and never below the authorised minimum.

## AI service layer (`src/lib/ai`)

- `run.ts` — single entry point: server-only key, structured output (`betaZodOutputFormat`) plus a second Zod `safeParse`, refusal handling, server-side model fallback, timeouts and retries (SDK), per-user daily limits, result caching by input hash + prompt version, and an `ai_runs` row for every call (model, prompt version, tokens, estimated cost, duration, status).
- `prompts.ts` — versioned system prompts with explicit "never invent" rules; user content is wrapped as data.
- `tasks.ts` — search parsing, listing generation, vehicle enrichment, valuation explanation, enquiry triage, market intelligence. `vehicleFacts()` sends only confirmed vehicle facts — never registration, VIN or personal data.
- Fallbacks without a key: rule-based natural-language search parser, deterministic valuation text, AI buttons shown as unavailable.

## Buyer matching (`src/lib/matching`)

Weighted, explainable scoring (budget 30%, make/model 25%, mileage 15%, location 15%, specification 10%, other 5% — configurable in `matching.weights`). Inputs are only the buyer's stated vehicle preferences. On publication, opted-in buyers above `matching.min_score` get a stored match with reasons and mismatches and a notification; saved-search alerts are sent too. The recommendations page ranks live listings on demand.

## Imports (`src/lib/imports`)

Upload (CSV/XLSX, ≤20MB, ≤5,000 rows) → raw rows stored → automatic column detection (synonym scoring) → manual mapping → validation & normalisation of every row → duplicate detection (in-file and against live registrations/VINs) → admin selects rows → batch processing in chunks of 50 using `claim_import_rows()` (`FOR UPDATE SKIP LOCKED`) with a job lease. Driven by the open admin page **and** by the cron worker, so it survives page closes. Idempotent: a unique index on `submission_data->>'import_row_id'` guarantees one vehicle per row. Failed rows can be retried; a CSV error report includes every invalid, duplicate or failed row with its original data.

## Notifications

`notifications` rows (in-app) are created by server code or database functions; `deliverNotification()` sends branded Resend emails respecting `notification_preferences` (essential payment/account emails always send) and records `email_status`. A cron delivers anything queued by database functions.

## Analytics

`admin_dashboard_stats()` and `admin_timeseries()` compute only recorded data. The single estimate (revenue run-rate) is visually separated and labelled. Listing views are de-duplicated per anonymous daily hash; bots are ignored. CSV export at `/api/admin/reports`.

## Key technical decisions

| Decision | Reason |
|---|---|
| Business rules in Postgres triggers/functions | Holds for every client (app, SQL console, future API); tested directly with `npm run test:db`. |
| `public_listings` security-barrier view | One audited definition of "public"; impossible to leak a column by forgetting a `select` list. |
| Pricing engine is deterministic; AI only explains | Reproducible, testable, no fabricated numbers. |
| Seller "minimum authorised price" checked on every listing write | Prevents any code path from undercutting the seller. |
| Fees in pence in `payments`, GBP integers elsewhere | Matches Stripe; avoids float errors. |
| Dealership tables present but unused by UI | Future dealer product without complicating the private-seller launch. |
| Next.js 16 `proxy.ts` | Middleware was renamed in Next 16; it only refreshes sessions and redirects anonymous users. Authorisation is always re-checked server-side. |
| Hand-written domain types (no generated DB types) | Keeps the build independent of a live database; run `npm run db:types` to generate Supabase types if preferred. |
