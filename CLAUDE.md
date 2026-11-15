# Family Hub: notes for AI-assisted sessions

Private household planner PWA (React + TS + Vite) on PocketBase, self-hosted on the
home server and reachable only over Tailscale. See README.md for everything operational.

## Ground rules
- Design source of truth: the "Family Hub — Mockups" design canvas (night + day boards).
  Match its layout, copy and tokens (`src/theme/tokens.css`). Original art only.
- Every screen reads via `useRecords`/`useRecord` (IndexedDB) and writes via
  `add`/`patch`/`remove` from `src/lib/sync`. Never call `pb.collection(...).create`
  from a screen for household data: it would bypass the offline outbox. Exceptions:
  profile updates and file uploads (need to be online).
- Cross-module logic goes in `src/lib/actions.ts` (menu → list, trip → inventory, chores).
- Date-only values are local `YYYY-MM-DD` strings; event times are PocketBase UTC
  datetimes (`toPB`/`fromPB`). Repeats are RRULE strings expanded via `src/lib/recurrence.ts`.
- Schema changes: add a NEW migration in `pb_migrations/`; never edit one that has shipped.
  Every new collection needs the household rules (copy `scoped` in the initial migration)
  and must be added to `SYNCED` in `src/lib/sync/db.ts` and to `CollectionMap` in `src/lib/types.ts`.
- Don't put real names, emails, addresses or locations in the repo. Test credentials
  live only in `tests/e2e/seed.dev.json` (local-only values).

## Checks before committing
`npm run typecheck && npm test` always; `npm run e2e` for UI/sync changes;
`npm run test:api` / `test:push` (need `npm run pb` + seeded data) for rules or the push worker.

## Phase status
Phases 1–2 done (Lists, Tasks, Quick add, Calendar, Today, Settings, imports, push).
Phase 3 (Recipes + Meals) and Phase 4 (Inventory) screens are placeholders
(`src/shared/ComingNext.tsx`); the schema and seed data for them already exist.
