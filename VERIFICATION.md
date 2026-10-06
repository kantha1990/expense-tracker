# Kharcha V4 verification

Verified 6 October 2026 against the production static export.

- `npm run typecheck`: PASS.
- `npm test`: PASS, 38 domain/storage tests. Includes the V1–V3 accounting and migration coverage plus Udharo principal/interest separation, partial repayments, overpayment and chronology rejection, linked interest deletion, due-debt reserves, V4 backup validation, CSV normalization, incoming review, atomic imports, repeat-import identity, transfer/manual-expense matching and stale-preview rejection.
- `npm run build`: PASS; Next.js compilation, TypeScript, static page generation and export to `out/`.
- BS tests: 2082/2083 New Year reference dates, current AD/BS roundtrip, Nepali numerals, all 2083 month starts, invalid/unsupported BS rejection, BS budget boundary and salary-day month-end behavior.
- Production browser checks: PASS at 390 × 844 and 1440 × 1000. Created bank/eSewa/cash accounts, recorded income and bank-to-wallet transfer, linked eSewa/cash expenses, set overall/category budget and savings reserve, selected BS budget period, rejected an invalid BS day, accepted Nepali digits, searched/filtered expenses, exported JSON, confirmed replacement restore with recovery copy, and verified balances/preferences after reload. No page runtime errors or horizontal overflow.
- Existing V2 browser regression: PASS for local English bill OCR (grand total NPR 847.50), review/save, expense editing and reload, credit purchase/repayment accounting, EMI mark-paid/advance, mobile/desktop fit. OCR uses local worker/WASM/language assets.
- V4 production browser checks: PASS for lending, existing borrowing, partial repayment with interest, rejected overpayment, available-cash reservation, actual CSV file upload, expense/income/transfer classification, receiving-account transfer matching without duplication, JSON export/restore, and repeated-import skipping. Mobile and desktop checks found no horizontal overflow or page runtime errors.
- CSV fixtures are synthetic. Real bank/wallet export layouts have not been certified; users map columns and review every import. CSV/TSV and pasted rows are supported; PDF, XLSX and statement-image extraction are not included.
- English+Nepali language assets included; real Nepali photo recognition accuracy remains unbenchmarked. Users must review OCR suggestions, dates and loan splits.
- Manual recorded balances and planning estimates are not bank-verified. No live bank/wallet sync, account authentication, cloud backup, family sharing, payment execution or background notifications.
- No credentials, environment files, test ledgers, private receipts or statement samples are committed.
