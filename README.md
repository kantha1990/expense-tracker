# Kharcha

A mobile-first personal expense tracker built with Next.js App Router, TypeScript and React. Default currency: NPR.

## Run locally

```sh
npm ci
npm run dev
```

Production: `npm run build` then `npm start`. Verify with `npm test` and `npm run typecheck`. Node.js 20.9+ is required.

## V1

- Dashboard with today's spending, current-month spending and category totals.
- Quick expense form: Food / Transport / Shopping / Home / Health / Other; Cash / Card / Bank; note and past/today date.
- Recent transactions, all transactions and confirmed deletion.
- Versioned local storage, safe write error handling, cross-tab refresh and JSON backup export.
- NPR default; currency selector supports NPR, INR and USD. All totals are filtered by currency; no exchange conversion or mixed-currency aggregation.
- Manifest, 192/512 icons, maskable icon, Apple touch icon, service worker and install prompt/help.
- Responsive mobile layout, native accessible modal, keyboard focus styles and safe-area navigation.

## Install and offline

Deploy to a Node-compatible Next.js host over HTTPS (localhost also works). Open the app once online so its shell and static assets can be cached. On Android Chrome use Install app; on iOS Safari use Share → Add to Home Screen. Browser install availability varies. Offline navigation falls back to the cached dashboard, and expenses stay local. Service worker caching is production oriented; use a fresh profile or unregister it during development. Bump the cache name when changing offline asset strategy.

## Persistence and future cloud sync

V1 stores data only in this browser/device under `kharcha.expenses.v1`. There is no login or server database. Clearing browser data removes expenses; export a backup before doing so. Backups are JSON exports; importing is not included in V1. Local data is not encrypted. Concurrent writes across tabs are best effort, not transactional.

`src/lib/expenses.ts` owns the domain schema, currency formatting and integer minor-unit amounts. Each record has a UUID, currency, timestamps and nullable user ID. `src/lib/storage.ts` defines the `ExpenseRepository` boundary. A future cloud adapter can use an async version of this boundary and authenticate per user, migrate local records explicitly after sign-in, implement per-user row-level access and idempotent sync by UUID, and resolve conflicts using versioning/timestamps. Authentication/cloud sync are not implemented in V1. Keep exchange-rate conversion explicit and separate from original transaction amounts.

## Security

No secrets or environment files are required for V1. `.env` and `.env.*` are ignored. Never put service-role credentials in browser code or commit credentials. Before cloud sync, review data ownership, access rules, privacy, and conflict handling.
