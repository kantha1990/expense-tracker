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

## V2: household, cards, EMI and bill scanning

- Household subcategories include Groceries, Vegetables & fruits, Milk & dairy, Cooking gas, Cleaning supplies and Domestic help. Added Bills, EMI, Family and Travel categories and related subcategories.
- Separate Debit Card and Credit Card methods. Historical V1 `Card` records stay generic; V1 `Home` records display as Household without losing data.
- Credit card accounts have an opening outstanding balance and monthly due day. Linked purchases add liability; recorded Bank repayments reduce liability and are excluded from spending totals. Opening balances are not expenses. Track each currency independently. Accounts linked to history cannot be deleted.
- Monthly EMI/bill schedules with next due date, optional remaining instalments, and user-entered interest/principal split. Marking a due payment paid writes one expense and advances the schedule in the same local-storage write. Month ends clamp correctly. The full EMI payment counts toward personal cash outflow; the split is informational. The fixed entered split repeats and is not an amortization calculator. Scheduled-payment transactions can be edited but cannot be deleted because they advance the schedule. Remove an unwanted schedule without affecting history.
- Due/overdue notices appear in-app; no background or push notifications. Scheduled costs are not included in totals until marked paid. Payments are never made automatically.
- Transaction editing, with stale edit detection when another tab changes the same record. Backups include accounts and schedules.
- Bill photo capture/upload uses self-hosted Tesseract.js OCR in the browser. English or English + Nepali, local recognition and no photo upload/storage. Extracted total, merchant, clear AD date and category suggestions populate the form. A required review checkbox prevents blind saving. Multiple recognized total candidates and raw OCR text remain visible for review. BS dates are not automatically converted. Manual amount entry remains available when OCR finds no clear total.
- First scan needs the worker/WASM/language downloads. Scanning may be slower on older phones; handwritten, blurred or unusual bills can be inaccurate. JPG, PNG, WebP and BMP files up to 15 MB; no PDF or HEIC support.
- `prebuild`/`predev` copy worker, cores and bundled language data from pinned npm dependencies into ignored `public/ocr/`. These assets are published but not stored in Git. The service worker caches OCR assets as used. Browser language caching supports reuse after the first successful scan.
- V2 uses schema version 2 under the same `kharcha.expenses.v1` key to preserve V1 device data. Clearing site/browser data still removes the local ledger. No cloud sync, authentication inside the app, or backup import is implemented.
