# Meridian Motors

**Premium Automotive Marketplace — a smarter way to buy and sell cars.**

Meridian Motors is a UK automotive marketplace and private-vehicle sales brokerage: a public marketplace for buyers, a seller dashboard with an 8-step submission wizard and Fast Sale pricing, and a full administration system for Meridian staff.

| | |
|---|---|
| **Stack** | Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage, RLS) · Claude API · Stripe · Resend · Sentry · Vercel |
| **Database** | 10 migrations in `supabase/migrations` — ~45 tables, the 17-stage sales pipeline as an enforced state machine, RLS on every table |
| **Tests** | `npm test` (35 unit tests) · `npm run test:db` (~80 database security & workflow assertions) |

## Documentation

- [docs/SETUP.md](docs/SETUP.md) — local development, environment variables, first super admin
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Supabase + Vercel production deployment, Stripe/Resend/DVLA/Sentry configuration
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design, security model, pipeline, pricing engine, AI layer, technical decisions
- [docs/TESTING.md](docs/TESTING.md) — test suites and what they prove
- [docs/STATUS.md](docs/STATUS.md) — what is complete, what needs external credentials, and launch checklist (including legal review)

## Quick start

```bash
npm install
cp .env.example .env.local      # fill in Supabase values (see docs/SETUP.md)
npx supabase start              # local Postgres/Auth/Storage + migrations
npm run dev
```

## Product rules the code enforces

- Only listings approved by **both** the seller and Meridian, and in an available pipeline stage, are ever public — enforced in the database view `public_listings`.
- Registration, VIN, contact details, addresses, minimum/expected prices, valuations, internal notes and documents are **never** exposed publicly.
- A seller's asking price can never go below their authorised minimum, and staff cannot change it without the seller's authorisation.
- Valuations require real, traceable comparables — or return *insufficient data*. Nothing is fabricated.
- AI-generated listing text is a draft until approved; AI never sets prices or invents vehicles.
- Payments are marked successful only by a signature-verified Stripe webhook.
