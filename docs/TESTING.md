# Testing

## Unit tests — `npm test` (Vitest, 35 tests)

| File | Covers |
|---|---|
| `src/lib/pricing/engine.test.ts` | Insufficient data returns no prices; zero comparables never fabricates; range/asking/fast-sale consistency; exclusion rules; outlier removal; mileage adjustment; positioning; price-review suggestions never below the authorised minimum; fee tiers & validation |
| `src/lib/matching/engine.test.ts` | Default 30/25/15/15/10/5 weights; explanations and mismatches; neutral scoring without preferences; personal characteristics are not inputs |
| `src/lib/imports/imports.test.ts` | Column detection; manual-mapping fallback; normalisation; every invalid value reported (not discarded); in-file and existing duplicates; 600-row CSV parsing |
| `src/lib/search/parse-natural.test.ts` | Natural-language fallback parser (incl. the brief's example); price vs mileage disambiguation; URL filter round-trip and junk rejection |
| `src/lib/stripe-webhook.test.ts` | Payment marked paid only for a paid session with matching amount/currency; unpaid sessions not marked paid; idempotent duplicate events; refunds; Stripe signature verification rejects forged/tampered payloads |

## Database tests — `npm run test:db` (~80 assertions)

`scripts/test-db.sh` starts a throwaway PostgreSQL 16 cluster, loads a minimal Supabase shim (`supabase/tests/shim`), applies every migration, and runs `supabase/tests/*.test.sql` acting as real roles (`anon`, `authenticated` with a JWT `sub`, and the server). It proves, among others:

- Signup metadata cannot grant a role; users cannot change their own role; admins cannot grant super admin.
- A seller cannot read, update or withdraw another seller's vehicle, or read their sale terms.
- Vehicle status cannot change outside the pipeline; invalid transitions and seller-only/staff-only transitions are enforced.
- Asking price never goes below the authorised minimum; staff cannot change price without seller authorisation; staff cannot pre-approve recommendations.
- A listing cannot publish without seller **and** Meridian approval; sellers cannot self-publish.
- AI-generated content does not change a listing until approved, and cannot be pushed into a published listing.
- Anonymous users cannot read vehicles, listings, sale terms or documents tables; `public_listings` contains no private columns; unapproved listings are not visible.
- Valuations cannot use fabricated comparables or complete without enough evidence.
- Buyers see only their own enquiries; sellers cannot read buyer contact details; other sellers see nothing.
- Customers and even admins cannot mark a payment successful; only the verified server path can; completed transactions and audit logs are immutable.
- Public users and other sellers cannot access private documents in Storage.
- Customers cannot call admin statistics or read audit logs / AI usage.

## End-to-end (manual / Playwright)

Verified against a local Supabase stack during development:

1. Seller registers, completes all 8 wizard steps (including real photo upload, insufficient-data valuation), submits.
2. Admin moves the vehicle through verification and valuation; seller edits and approves the listing; admin approves and publishes.
3. Anonymous visitor finds the vehicle; the public HTML is checked for registration, minimum price, seller email and full postcode (none present); guest submits an enquiry.
4. Seller reports a sale; admin confirms completion; a £249 success fee is raised as pending; all 8 status changes are in the history with user and reason.
5. 601-row CSV import: 599 imported, 1 invalid reported, 1 duplicate flagged, 0 failures; re-importing flags the existing registrations as duplicates.
6. Valuation with [DEMO] comparables: 6 comparables, adjusted prices, 71% confidence, seller's price correctly flagged as above market.
7. Every admin page returns 200 for a super admin; `/admin` returns 404 for a customer. Mobile (iPhone 13) layouts have no horizontal overflow.

Recommended before launch: add these flows as a committed Playwright suite in CI against a disposable Supabase project.
