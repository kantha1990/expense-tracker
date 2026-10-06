import test from "node:test";
import assert from "node:assert/strict";
import { Expense, Ledger, payRecurring, totals } from "../src/lib/expenses";
import {
  accountBalance,
  defaultPlan,
  emptyLedger,
  MoneyAccount,
  MoneyEntry,
  planningSummary,
} from "../src/lib/finance";
import { bsISO, budgetPeriod, fromBS } from "../src/lib/calendar";
import {
  parseLedger,
  readLedger,
  RECOVERY_KEY,
  restoreLedger,
  STORAGE_KEY,
  writeLedger,
} from "../src/lib/storage";
const today = "2026-10-06";
const bank: MoneyAccount = {
  id: "bank",
  name: "Bank",
  kind: "Bank",
  currency: "NPR",
  openingMinor: 1000000,
  openingDate: "2026-10-01",
};
const wallet: MoneyAccount = {
  ...bank,
  id: "wallet",
  name: "eSewa",
  kind: "eSewa",
  openingMinor: 0,
};
const expense: Expense = {
  id: "e",
  amountMinor: 80000,
  currency: "NPR",
  category: "Household",
  subcategory: "Groceries",
  paymentMethod: "eSewa",
  accountId: "wallet",
  note: "Groceries",
  date: today,
  createdAt: "now",
  updatedAt: "now",
  userId: null,
};
const transfer: MoneyEntry = {
  id: "t",
  kind: "transfer",
  amountMinor: 500000,
  currency: "NPR",
  fromAccountId: "bank",
  toAccountId: "wallet",
  note: "Top-up",
  date: today,
  createdAt: "now",
  updatedAt: "now",
  userId: null,
};
const state = (): Ledger => ({
  ...emptyLedger(),
  accounts: [bank, wallet],
  entries: [transfer],
  expenses: [expense],
});
function mockStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => values.set(k, v),
    },
    configurable: true,
  });
  return values;
}
test("wallet top-ups conserve total balances and groceries count once", () => {
  const s = state();
  assert.equal(accountBalance(bank, s, today), 500000);
  assert.equal(accountBalance(wallet, s, today), 420000);
  assert.equal(planningSummary(s, "NPR", today).cash, 920000);
  assert.deepEqual(totals(s.expenses, today, "NPR"), {
    today: 80000,
    month: 80000,
  });
  const income: MoneyEntry = {
    ...transfer,
    id: "i",
    kind: "income",
    amountMinor: 200000,
    fromAccountId: undefined,
    toAccountId: "bank",
  };
  s.entries!.push(income);
  assert.equal(planningSummary(s, "NPR", today).income, 200000);
  assert.equal(planningSummary(s, "NPR", today).cash, 1120000);
});
test("credit purchases and linked repayments do not double-count available cash or spending", () => {
  const s = state();
  s.cards = [
    {
      id: "c",
      name: "Card",
      currency: "NPR",
      openingBalanceMinor: 100000,
      dueDay: 15,
    },
  ];
  s.expenses.push({
    ...expense,
    id: "cc",
    accountId: undefined,
    cardId: "c",
    paymentMethod: "Credit Card",
    amountMinor: 200000,
  });
  const before = planningSummary(s, "NPR", today);
  assert.equal(before.available, 620000);
  s.expenses.push({
    ...expense,
    id: "repay",
    accountId: "bank",
    cardId: "c",
    kind: "transfer",
    paymentMethod: "Bank",
    amountMinor: 150000,
  });
  const after = planningSummary(s, "NPR", today);
  assert.equal(after.available, before.available);
  assert.equal(after.outstanding, 150000);
  assert.equal(after.spent, 280000);
  assert.equal(accountBalance(bank, s, today), 350000);
});
test("scheduled bill reserve is released when paid; linked balance falls by the same amount", () => {
  const s = state();
  s.recurring = [
    {
      id: "r",
      name: "Internet",
      currency: "NPR",
      amountMinor: 100000,
      category: "Bills",
      subcategory: "Internet",
      paymentMethod: "Bank",
      accountId: "bank",
      nextDue: today,
      dueDay: 6,
      remaining: null,
      interestMinor: 0,
    },
  ];
  const before = planningSummary(s, "NPR", today);
  assert.equal(before.bills, 100000);
  const paid = payRecurring(s, "r", today);
  const after = planningSummary(paid, "NPR", today);
  assert.equal(after.bills, 0);
  assert.equal(after.available, before.available);
  assert.equal(after.cash, before.cash - 100000);
  assert.equal(paid.expenses.at(-1)?.accountId, "bank");
});
test("overdue recurring instalments are all reserved until period end, bounded by remaining count", () => {
  const s = state();
  s.recurring = [
    {
      id: "r",
      name: "EMI",
      currency: "NPR",
      amountMinor: 100000,
      category: "EMI",
      subcategory: "Other loan",
      paymentMethod: "Bank",
      nextDue: "2026-08-06",
      dueDay: 6,
      remaining: 2,
      interestMinor: 0,
    },
  ];
  assert.equal(planningSummary(s, "NPR", today).bills, 200000);
});
test("budgets exclude transfers, isolate currencies and subtract remaining savings reserve", () => {
  const s = state();
  s.accounts!.push({
    ...bank,
    id: "usd",
    currency: "USD",
    openingMinor: 999999,
  });
  s.plans = [
    {
      ...defaultPlan("NPR"),
      limitMinor: 100000,
      savingsReserveMinor: 200000,
      categoryLimits: { Household: 100000 },
    },
  ];
  const result = planningSummary(s, "NPR", today);
  assert.equal(result.available, 720000);
  assert.equal(result.spent, 80000);
  assert.equal(result.plan.limitMinor - result.spent, 20000);
  assert.equal(planningSummary(s, "USD", today).cash, 999999);
});
test("old unlinked expenses remain spending without changing new opening balances", () => {
  const s = state();
  s.expenses.push({
    ...expense,
    id: "old",
    accountId: undefined,
    date: "2026-10-01",
  });
  assert.equal(planningSummary(s, "NPR", today).unlinked, 1);
  assert.equal(planningSummary(s, "NPR", today).cash, 920000);
  assert.equal(planningSummary(s, "NPR", today).spent, 160000);
});
test("backup validation rejects duplicates, cross-currency links and predating account openings", () => {
  const s = state();
  assert.equal(parseLedger(JSON.stringify(s)).version, 4);
  assert.throws(
    () => parseLedger(JSON.stringify({ ...s, expenses: [expense, expense] })),
    /duplicate/,
  );
  assert.throws(
    () =>
      parseLedger(
        JSON.stringify({ ...s, entries: [{ ...transfer, currency: "USD" }] }),
      ),
    /account link/,
  );
  assert.throws(
    () =>
      parseLedger(
        JSON.stringify({
          ...s,
          expenses: [{ ...expense, date: "2026-09-30" }],
        }),
      ),
    /account link/,
  );
  assert.throws(
    () =>
      parseLedger(
        JSON.stringify({
          ...s,
          expenses: [{ ...expense, paymentMethod: "Cash" }],
        }),
      ),
    /payment method/,
  );
  assert.throws(
    () => parseLedger(JSON.stringify({ ...s, version: 99 })),
    /supported/,
  );
});
test("V2 migration preserves existing records and restore keeps exact recovery copy", () => {
  const values = mockStorage();
  const v2 = {
    version: 2,
    expenses: [{ ...expense, accountId: undefined }],
    cards: [],
    recurring: [],
  };
  values.set(STORAGE_KEY, JSON.stringify(v2));
  const migrated = readLedger();
  assert.equal(migrated.expenses.length, 1);
  assert.equal(migrated.version, 4);
  assert.deepEqual(migrated.accounts, []);
  const previous = values.get(STORAGE_KEY);
  restoreLedger(JSON.stringify(state()));
  assert.equal(values.get(RECOVERY_KEY), previous);
  assert.equal(readLedger().accounts!.length, 2);
  const good = values.get(STORAGE_KEY);
  assert.throws(() => restoreLedger("{broken"));
  assert.equal(values.get(STORAGE_KEY), good);
});
test("storage write failure leaves ledger intact and reports failure", () => {
  let raw = JSON.stringify(state());
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: () => raw,
      setItem: () => {
        throw Error("Quota exceeded");
      },
    },
    configurable: true,
  });
  assert.throws(() => writeLedger({ ...state(), expenses: [] }), /Quota/);
  assert.equal(JSON.parse(raw).expenses.length, 1);
});
test("BS conversion matches known New Year boundaries and rejects rolled-over dates", () => {
  assert.equal(bsISO("2026-04-14"), "2083-01-01");
  assert.equal(bsISO(today), "2083-06-20");
  assert.equal(fromBS("२०८३-०६-२०"), today);
  assert.equal(fromBS("2082-01-01"), "2025-04-14");
  assert.throws(() => fromBS("2083-13-01"));
  assert.throws(() => fromBS("2083-06-32"));
  assert.throws(() => fromBS("2099-01-01"));
  for (let month = 1; month <= 12; month++) {
    const date = fromBS(`2083-${month}-01`);
    assert.equal(bsISO(date), `2083-${String(month).padStart(2, "0")}-01`);
  }
});
test("BS budget boundary follows calendar; payday clamps independently each month", () => {
  const bs = budgetPeriod("2026-04-14", "BS");
  assert.equal(bs.start, "2026-04-14");
  assert.equal(bs.end, "2026-05-14");
  assert.equal(bs.label, "Baisakh 2083 BS");
  assert.deepEqual(budgetPeriod("2026-02-28", "payday", 31), {
    start: "2026-02-28",
    end: "2026-03-30",
    label: "Feb 28, 2026 – Mar 30, 2026",
  });
  assert.equal(budgetPeriod("2026-03-01", "payday", 31).start, "2026-02-28");
  assert.equal(budgetPeriod("2026-03-31", "payday", 31).end, "2026-04-29");
});
