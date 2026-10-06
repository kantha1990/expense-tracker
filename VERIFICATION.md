# Kharcha V2 verification

- Production static export build: PASS (compilation, TypeScript and page generation).
- Unit tests: PASS, 11 tests covering precise minor units, currency/date aggregation, corruption preservation, V1 migration, credit repayment exclusion, recurring EMI atomic update/month-end logic, receipt totals after VAT/discount, Nepali digits, and ambiguous/BS dates.
- Browser bill scan: printed English fixture recognized grand total NPR 847.50 and populated the amount field using local worker/WASM/language assets.
- Browser tests: PASS for mobile fit, actual local English OCR scan-to-amount review/save, edit/reload persistence, card purchase/repayment accounting, EMI paid/schedule advance, and desktop fit. No runtime page errors.
- English + Nepali OCR language assets included; Nepali-number receipt parsing tested. Real Nepali photo recognition still depends on print quality and has not been benchmarked.
- No payment execution, background notifications or cloud sync. Due indicators require opening the app. Manually verify recognition and EMI split against source documents.
- No secrets or environment files included.
