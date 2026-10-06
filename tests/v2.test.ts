import test from "node:test";
import assert from "node:assert/strict";
import {
  Expense,
  Ledger,
  cardBalance,
  totals,
  nextMonthlyDate,
  payRecurring,
  validDate,
} from "../src/lib/expenses";
import {
  readLedger,
  writeLedger,
  localExpenseRepository,
} from "../src/lib/storage";
import { parseReceipt } from "../src/lib/receipts";
const expense: Expense = {
  id: "e",
  amountMinor: 10000,
  currency: "NPR",
  category: "Household",
  subcategory: "Groceries",
  paymentMethod: "Credit Card",
  cardId: "c",
  note: "Groceries",
  date: "2026-10-06",
  createdAt: "now",
  updatedAt: "now",
  userId: null,
};
const card = {
  id: "c",
  name: "My card",
  currency: "NPR" as const,
  openingBalanceMinor: 5000,
  dueDay: 15,
};
test("card purchases count once; repayments lower liability, not spending", () => {
  const paid: Expense = {
    ...expense,
    id: "p",
    kind: "transfer",
    amountMinor: 7000,
    paymentMethod: "Bank",
  };
  assert.equal(cardBalance(card, [expense, paid]), 8000);
  assert.deepEqual(totals([expense, paid], "2026-10-06", "NPR"), {
    today: 10000,
    month: 10000,
  });
  assert.equal(
    cardBalance(card, [expense, { ...paid, currency: "USD" }]),
    15000,
  );
});
test("monthly recurrence clamps month ends then restores original due day", () => {
  assert.equal(nextMonthlyDate("2026-01-31", 31), "2026-02-28");
  assert.equal(nextMonthlyDate("2026-02-28", 31), "2026-03-31");
  assert.equal(nextMonthlyDate("2027-12-31", 31), "2028-01-31");
  assert.equal(nextMonthlyDate("2028-01-31", 31), "2028-02-29");
  assert.equal(validDate("2026-02-30"), false);
});
test("marking recurring EMI paid adds split expense and advances remaining count atomically", () => {
  const state: Ledger = {
    version: 2,
    expenses: [],
    cards: [],
    recurring: [
      {
        id: "r",
        name: "Vehicle EMI",
        amountMinor: 1800000,
        currency: "NPR",
        category: "EMI",
        subcategory: "Vehicle loan",
        paymentMethod: "Bank",
        nextDue: "2026-10-06",
        dueDay: 6,
        remaining: 2,
        interestMinor: 300000,
      },
    ],
  };
  const next = payRecurring(state, "r", "2026-10-06");
  assert.equal(next.expenses[0].principalMinor, 1500000);
  assert.equal(next.expenses[0].interestMinor, 300000);
  assert.equal(next.recurring[0].nextDue, "2026-11-06");
  assert.equal(next.recurring[0].remaining, 1);
  assert.throws(() => payRecurring(next, "r", "2026-10-06"));
  const done = payRecurring(next, "r", "2026-11-06");
  assert.equal(done.recurring.length, 0);
  assert.equal(done.expenses.length, 2);
  assert.equal(state.expenses.length, 0);
});
test("V1 Home records migrate without changing payment meaning; future saves preserve card state", () => {
  let raw = JSON.stringify({
    version: 1,
    expenses: [
      {
        ...expense,
        category: "Home",
        paymentMethod: "Card",
        cardId: undefined,
      },
    ],
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: () => raw,
      setItem: (_key: string, s: string) => {
        raw = s;
      },
    },
    configurable: true,
  });
  assert.equal(readLedger().expenses[0].category, "Household");
  assert.equal(readLedger().expenses[0].paymentMethod, "Card");
  writeLedger({ ...readLedger(), cards: [card] });
  localExpenseRepository.save([]);
  assert.equal(readLedger().cards.length, 1);
  assert.equal(readLedger().version, 3);
  raw = JSON.stringify({
    version: 2,
    expenses: [],
    cards: [{ ...card, openingBalanceMinor: "bad" }],
    recurring: [],
  });
  const original = raw;
  assert.throws(() => readLedger());
  assert.equal(raw, original);
});
test("receipt parser prefers grand total after VAT and discount; ignores change and subtotal", () => {
  const r = parseReceipt(
    "Test Grocery Mart\nDate 2026-10-06\nSubtotal 1000.00\nDiscount 100.00\nVAT 117.00\nGrand Total (incl VAT) NPR 1,017.00\nCash tendered 2000.00\nChange 983.00",
  );
  assert.equal(r.amount, "1017.00");
  assert.equal(r.category, "Household");
  assert.equal(r.subcategory, "Groceries");
  assert.equal(r.date, "2026-10-06");
  assert.equal(r.currency, "NPR");
});
test("Nepali digits and labels scan; BS dates convert to their AD equivalent", () => {
  const r = parseReceipt("तरकारी पसल\n2083-06-20\nकुल जम्मा रु १,२५०.५०");
  assert.equal(r.amount, "1250.50");
  assert.equal(r.date, "2026-10-06");
  assert.equal(r.subcategory, "Vegetables & fruits");
});
test("ambiguous totals are retained for review and unlabeled numbers do not become amounts", () => {
  const r = parseReceipt("SHOP\nTotal 100.00\nAmount payable 113.00");
  assert.equal(r.amount, "113.00");
  assert.equal(r.candidates.length, 2);
  assert.equal(parseReceipt("Phone 9800000000\nInvoice 32444").amount, "");
});
