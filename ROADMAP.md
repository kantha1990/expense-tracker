# Kharcha product roadmap

Updated 6 October 2026. This file is a development plan, not a promise that future features are already available. Each milestone ships after its acceptance criteria pass; no automatic future development or release schedule is configured.

## Product promise and audience

A household money planner for people in Nepal: see what remains until payday across cash, banks and wallets after bills, cards and savings. Prioritize households handling cash and digital payments together, recurring obligations, and occasional NPR/INR spending.

Keep quick entry, mobile performance, clear money accounting and optional local-only use central. NPR formatting, categories and receipt scanning alone are common tracker features. Nepal-specific calendar, reliable imports and household workflows should earn repeat use.

## Release 3 — implemented foundation

| Capability           | Scope                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Recovery             | JSON export, V1/V2/V3 restore preview, explicit replacement confirmation, previous-ledger recovery copy and validation before writes.                        |
| Money accounts       | Cash, Bank, eSewa, Khalti and Other wallet accounts with currency and opening date/balance.                                                                  |
| Income and transfers | Income receipt, wallet top-up, bank/cash transfer, edit/delete history. Transfers conserve tracked balances and do not count as income or expenses.          |
| Linked expenses      | Optional paying account on expenses, card repayments and recurring payments. Existing records remain unlinked until edited.                                  |
| Planning             | Overall and category spending limits, remaining savings reserve, AD month, BS month or AD salary-day cycle.                                                  |
| Available estimate   | Recorded account balances less positive card liabilities, unpaid scheduled bills through period end and remaining savings reserve. Unlinked expense warning. |
| Nepal calendar       | BS/AD date display and entry, Nepali numeral input, BS monthly boundaries, clear supported BS receipt dates converted to AD for review.                      |
| History              | Expense search and category/payment-method filters. Income/account transfer history lives in Accounts.                                                       |

Local records and backups are not encrypted. There is no live provider sync, financial app login, shared household, automatic payment execution or background reminder. NPR/INR/USD remain separate ledgers without exchange conversion. Balances are user-maintained estimates.

## Next — durability and cloud sync (planned Release 5)

Prerequisites: choose the Supabase project and deploy environment; define retention/deletion policy and sign-in experience before connecting real user data.

- Keep local-only use available. Add optional sign-in and encrypted transport for cross-device sync.
- Evolve `LedgerRepository` into an async adapter with explicit local-to-account migration and export before migration.
- Use UUID identities, revision checks, deletion tombstones, offline mutation queue and idempotent retries. Avoid last-write-wins for multi-record financial changes.
- Protect each owner's records with row-level ownership rules; test cross-user reads/writes and ownership reassignment. Keep privileged keys out of clients and Git.
- Add sync status, last successful backup, recovery from a second device, sign-out data handling and account deletion.
- Add account reconciliation against a user-entered real balance, with an explicit dated adjustment rather than silently rewriting history.

Ship gate: airplane-mode writes recover on reconnect without duplicates; two devices editing one record resolve safely; another user's records are inaccessible; a lost-device recovery reproduces account balances and schedules exactly.

## Release 4 — local CSV imports and Udharo (implemented)

- Generic user-supplied CSV/TSV imports and pasted spreadsheet rows are implemented. PDF/screenshot/provider-specific parsers remain future work. Request representative redacted formats before implementing each importer; do not assume CSV/PDF support across providers.
- Configurable column/date/amount mapping is implemented; provider-specific adapters will be versioned. Store normalized fingerprint identities and import-batch metadata. Preview dates, signs, currency, transfers and duplicate matches before applying an import.
- Transfers, Udharo and bank-funded card repayments can be selected during import review; separate fees as expenses. Confirm matches instead of silently pairing uncertain records.
- Implemented Udharo: money lent/borrowed, opening debts, partial repayments and outstanding balances. Borrowing is a liability, not salary; principal repayments clear debts, while interest is an expense.
- Future: add Roman Nepali text shortcuts such as “tarkari 250 cash”; suggestions require review. Evaluate speech recognition by device/language/privacy support before committing to voice entry.

Ship gate: importing the same statement twice creates no duplicate entries; known fixture totals reconcile; transfers do not inflate spending; debt repayments count once. Direct consumer sync waits for approved provider access—merchant payment APIs do not imply access to an individual's complete wallet history.

## Then — shared household and Nepal savings goals (planned Release 6)

- Shared household with explicit invitations and owner/member permissions. Keep personal accounts private unless selected for sharing; offer member attribution and household totals.
- Festival and family savings pots: Dashain, Tihar, Chhath, weddings, school admissions and emergency fund. Set targets and reserve transfers without treating contributions as consumption.
- Household plans for groceries, vegetables, dairy, LPG, drinking water, school fees and domestic help; customizable categories after migration/validation support exists.
- Remittance receipt and fees, household allocation and separate savings/investment contributions (SIPs, fixed deposits, cooperatives).
- Optional recurring-payment notifications with permission, documented browser support and an in-app fallback. No automatic payments.

Ship gate: members can access only shared records; leaving a household has defined data behavior; shared edits cannot lose records; savings allocations do not double-count expenses; festival dates use a maintained source or explicit user entry.

## Later — receipt quality, debt detail and currency conversion (planned Release 7)

- Benchmark receipt recognition on diverse Nepali/English bills and phone photos. Show confidence for totals/dates and track reviewed corrections locally or only with explicit consent.
- Receipt line-item splits, discounts/VAT allocation, duplicate bill detection and optional original receipt attachment. Preserve one reconciled bill total.
- Grocery units (kg, litre, packet), per-unit price history from the user's own receipts and household repeat purchase templates.
- Card statement cycle, billed/unbilled balances, minimum payment, fees and interest; validated loan amortization and variable-rate changes using lender inputs.
- Keep original amount/currency, explicit rate/date/source and fee for NPR/INR/USD conversions. Allow manual rates; explain that converted aggregate values are estimates.

Ship gate: split lines reconcile to the reviewed total; dates reject impossible BS days; statement totals match fixtures; loan calculations match lender samples; conversions preserve original amounts and never mix currencies silently.

## Product validation before expanding further

Pilot with Nepal households using cash plus wallets. Measure voluntary onboarding completion, weekly returning use, median time to add an expense, backup recovery success, import correction rate, receipt amount/date accuracy and account reconciliation differences. Establish a baseline before choosing numerical targets.

Interview users who stop logging: discover whether effort, missing accounts, unreliable balances or unclear benefit caused abandonment. Favor improvements that reduce that friction over additional dashboards.

## Technical boundaries

- `expenses.ts`: legacy-compatible spending, cards and schedules.
- `finance.ts`: account, income/transfer and budget contracts, integer amounts, accounting and link checks.
- `calendar.ts`: one isolated BS conversion adapter; stored transaction dates remain AD.
- `storage.ts`: versioned migration, validated local repository and restore/recovery boundary.
- `debts.ts`: principal cash flows, outstanding balances and linked interest validation.
- `imports.ts`: CSV normalization, reviewed batch application, fingerprint identities and existing-movement linking.
- Future modules: `sync`, `imports/providers`, `households`, `goals`, `notifications`, `fx`. Add only when their milestone ships.
- Keep user transactions, bill images, statement samples, credentials, tokens and environment files out of source control.

## Research references

Reviewed official product pages on 6 October 2026:

- [Wallet features](https://budgetbakers.com/en/products/wallet/): budgets, imports, planned payments, family sharing and multi-currency support.
- [Spendee developer listing](https://apps.apple.com/np/app/money-tracker-spendee/id635861140): receipt scanning, budgets, shared finances and sync.
- [YNAB features](https://www.ynab.com/features): targets, reports and debt planning.
- [Khalti transaction API](https://docs.khalti.com/api/transaction/): merchant payment listing, not proof of consumer wallet-history access.
- [Nepali-Date library](https://github.com/subeshb1/Nepali-Date): BS/AD conversion adapter. Package pinned; validate calendar reference fixtures before changing its data/version.

Specific Nepali bank compatibility in global trackers has not been established here. Do not advertise competitors as unsupported without verifying each bank.
