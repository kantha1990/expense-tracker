import test from "node:test";
import assert from "node:assert/strict";
import { parseReceipt } from "../src/lib/receipts";
test("recognizes joined, separated and OCR-confused total labels", () => {
  for (const label of [
    "sgrandtotal",
    "GrandTotal",
    "GRAND T0TAL",
    "Grand TotaI",
    "Grand Tota1",
    "Grand To tal",
    "Grand Tota!",
  ]) {
    assert.equal(
      parseReceipt(
        `SHOP\nSub Total 1,000.00\n${label}: Rs 1,130.00\nCash Tendered 2,000.00\nChange 870.00`,
      ).amount,
      "1130.00",
      label,
    );
  }
  assert.equal(parseReceipt("Total NPR 780.50").amount, "780.50");
});
test("connects a total label to its next amount line without crossing other labels", () => {
  assert.equal(parseReceipt("Grand Total\nNPR\n1,250.50").amount, "1250.50");
  assert.equal(parseReceipt("कुल जम्मा\nरु १,२५०.५०").amount, "1250.50");
  assert.equal(parseReceipt("Total\nDate 2026-10-07\n8,000.00").amount, "");
  assert.equal(parseReceipt("Grand Total\nVAT 13.00\n100.00").amount, "");
});
test("accepts Indian grouping and ignores tax percentages/counts/change", () => {
  assert.equal(
    parseReceipt("Grand Total NPR 1,23,456.78 (VAT 13%)").amount,
    "123456.78",
  );
  assert.equal(
    parseReceipt(
      "Total Items 12\nTOTAL QTY 19\nTax Total 30\nTotal VAT 40\nTotal Discount 50\nTotal Savings 20\nChange 100\nPhone 9800000000",
    ).amount,
    "",
  );
  assert.equal(parseReceipt("Grand Total 1,23.456").amount, "");
  assert.equal(parseReceipt("Grand Total 100.123").amount, "");
});
test("a second reading retains conflicting total candidates for explicit review", () => {
  const r = parseReceipt(
    "Total 800.00\nGrand Total 847.50\nGrandTotal 847.50\nGrand Total 847.80",
  );
  assert.equal(r.amount, "847.50");
  assert.deepEqual(
    r.candidates.map((c) => c.amount),
    ["847.50", "847.80", "800.00"],
  );
});
