# Status & launch checklist

## Built and verified

| Area | State |
|---|---|
| Public site: homepage, marketplace (filters, URL state, sort, pagination, suggestions, distance, saved searches), vehicle pages (gallery, disclosures, verification evidence, enquiry, similar, JSON-LD), sell, how it works, about, contact, help, draft legal pages, cookie consent | ✅ |
| Auth: register (email verification), login, password reset, sessions, sign-out, rate limiting | ✅ |
| Customer dashboard: selling (8-step autosaving wizard, uploads, valuations, pricing, listing approval, AI drafts, insights, enquiries & messaging, sales, services, documents, payments) and buying (saved vehicles, saved searches, preferences, recommendations, enquiries), notifications, settings, data export, deletion requests | ✅ |
| Admin: overview, inventory (+ manual add, detail), listing approval queue, sales pipeline board, enquiries CRM (assignment, notes, follow-ups, viewings, AI triage), conversations, sellers (+ assistance), buyers, users & roles (+ GDPR requests), valuations, pricing engine, analytics (+ CSV), AI usage, payments (+ refunds), services, import centre, settings, audit logs | ✅ |
| Database: schema, constraints, indexes, pipeline state machine, RLS on every table, storage policies, audit triggers | ✅ |
| Fast Sale engine, buyer matching, import pipeline, Stripe webhook, cron jobs, sitemap/robots/OG, Sentry hooks | ✅ |

## Needs external configuration (safe "unavailable" state until then)

| Integration | What to provide |
|---|---|
| Supabase (production) | Project, migrations pushed, auth URLs, SMTP |
| Claude API | `ANTHROPIC_API_KEY` |
| Stripe | Secret key + webhook secret (see DEPLOYMENT.md) |
| Resend | API key + verified domain |
| DVLA VES | API key from the DVLA developer portal |
| Sentry | DSN (+ auth token for source maps) |
| Licensed history checks (finance, stolen, write-off, mileage) | Provider contract and integration — **not connected**; the UI says so |
| Licensed comparable data | Provider contract + implementation in `src/lib/pricing/providers.ts` |
| Brand photography | The hero uses vector brand artwork; add licensed photography if desired |

## Before public launch

- [ ] **Legal review** of the draft Terms, Privacy, Cookie policies and seller declaration (all marked "Draft for legal review"; `[LEGAL REVIEW]` markers indicate specific points: company details, broker/agent status and duties, consumer law for brokered private sales, fee terms incl. off-platform sales, complaints/ADR, retention schedule, international transfers).
- [ ] Confirm commercial fee tiers and service prices (Admin → Settings / Services).
- [ ] ICO registration; Records of Processing; DPIA for AI-assisted processing.
- [ ] Insurance (professional indemnity / public liability) appropriate to brokerage activity.
- [ ] Mark production: `site.environment = "production"` (blocks demo data).
- [ ] Provision the first super admin with `npm run admin:provision`.
- [ ] Add Playwright E2E suite to CI; run `npm test` and `npm run test:db` in CI.
- [ ] Penetration test / security review of RLS policies against the production project.
- [ ] Load testing of `search_listings` with production-like volumes (consider a materialised search table beyond ~50k listings).
