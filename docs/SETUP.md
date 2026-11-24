# Local setup

## Prerequisites

- Node.js 22+
- Docker (for the local Supabase stack) — or a hosted Supabase project
- Optional: PostgreSQL 16 client binaries for `npm run test:db`

## 1. Install

```bash
npm install
cp .env.example .env.local
```

## 2. Start Supabase locally

```bash
npx supabase start
```

This starts Postgres, Auth, PostgREST and Storage and applies every migration in `supabase/migrations`. Copy the printed **API URL**, **anon key** and **service_role key** into `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GEOCODING_ENABLED=true
```

> If Docker cannot pull from `public.ecr.aws`, run `export SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io` first.
> To save resources: `npx supabase start -x studio,imgproxy,realtime,edge-runtime,logflare,vector,supavisor,postgres-meta`.

Reset the database (re-applies all migrations, deletes data): `npx supabase db reset`.

## 3. Run the app

```bash
npm run dev          # http://localhost:3000
```

## 4. Create the first super administrator

Roles can never be granted from the browser. Register normally at `/register` (or let the script invite you), then:

```bash
SUPER_ADMIN_EMAIL=you@example.co.uk npm run admin:provision
```

The script uses the service-role key, grants `super_admin`, and writes an audit entry. From then on, super admins grant other roles in **Admin → Users & roles**. Remove `SUPER_ADMIN_EMAIL` from your environment afterwards.

| Role | Can |
|---|---|
| `super_admin` | Everything, including granting/revoking administrator roles |
| `admin` | All operations, settings, imports, users (except admin roles), audit logs, AI usage |
| `sales_operator` | Pipeline, listing approval/publication, valuations, enquiries, sales, services |
| `verification_operator` | Verifications and checks, enquiries, inventory review |
| `customer` | Buy and sell from one account (seller/buyer capabilities are created on first use) |
| dealership owner / staff | Per-dealership membership (`dealership_members.role`) — schema and RLS ready for the future dealer product |

## 5. Optional demo data (local only)

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/seed/demo.sql
```

Loads ten **[DEMO]**-labelled vehicles (seven live listings, three completed sales) so valuations have comparables. Remove with `supabase/seed/remove-demo.sql`. Never load demo data into production.

## Environment variables

See `.env.example` for the full list. Only `NEXT_PUBLIC_*` values reach the browser; every secret is server-only.

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | yes | Canonical URLs, email links, auth redirects |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase client (RLS applies) |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-only: webhooks, cron, imports, valuations, notifications |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | optional | AI features (default model `claude-opus-5-5`) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | optional | Fee and service payments |
| `RESEND_API_KEY`, `EMAIL_FROM` | optional | Transactional email |
| `DVLA_VES_API_KEY`, `DVLA_VES_API_URL` | optional | Registration lookups |
| `NEXT_PUBLIC_SENTRY_DSN` (+ `SENTRY_*` for source maps) | optional | Error monitoring |
| `CRON_SECRET` | production | Authorises `/api/cron/*` |
| `SESSION_HASH_SALT` | production | Hashes IPs for rate limiting and view de-duplication |
| `GEOCODING_ENABLED` | optional | Postcode-district geocoding via postcodes.io (default on) |

Every optional integration degrades to a clearly labelled "not configured / unavailable" state — nothing pretends to be connected.
