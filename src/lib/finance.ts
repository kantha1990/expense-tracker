import {
  categories,
  Category,
  currencies,
  Currency,
  Expense,
  Ledger,
  cardBalance,
  isSpending,
  nextMonthlyDate,
  validDate,
} from "./expenses";
import { budgetPeriod } from "./calendar";
export const accountKinds = [
  "Cash",
  "Bank",
  "eSewa",
  "Khalti",
  "Other wallet",
] as const;
export type MoneyAccount = {
  id: string;
  name: string;
  kind: (typeof accountKinds)[number];
  currency: Currency;
  openingMinor: number;
  openingDate: string;
};
export type MoneyEntry = {
  id: string;
  kind: "income" | "transfer";
  amountMinor: number;
  currency: Currency;
  toAccountId: string;
  fromAccountId?: string;
  note: string;
  date: string;
  createdAt: string;
  updatedAt: string;
  userId: string | null;
};
export type BudgetPlan = {
  currency: Currency;
  limitMinor: number;
  savingsReserveMinor: number;
  mode: "AD" | "BS" | "payday";
  payday: number;
  categoryLimits: Partial<Record<Category, number>>;
};
export const defaultPlan = (currency: Currency): BudgetPlan => ({
  currency,
  limitMinor: 0,
  savingsReserveMinor: 0,
  mode: "AD",
  payday: 1,
  categoryLimits: {},
});
export const emptyLedger = (): Ledger => ({
  version: 3,
  expenses: [],
  cards: [],
  recurring: [],
  accounts: [],
  entries: [],
  plans: [],
  dateDisplay: "AD",
});
export function validMinor(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 99999999999
  );
}
const text = (v: unknown) =>
  typeof v === "string" && v.length > 0 && v.length <= 200;
export function isAccount(value: unknown): value is MoneyAccount {
  if (!value || typeof value !== "object") return false;
  const a = value as MoneyAccount;
  return (
    text(a.id) &&
    text(a.name) &&
    accountKinds.includes(a.kind) &&
    currencies.includes(a.currency) &&
    validMinor(a.openingMinor) &&
    validDate(a.openingDate)
  );
}
export function isEntry(value: unknown): value is MoneyEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as MoneyEntry;
  return (
    text(e.id) &&
    ["income", "transfer"].includes(e.kind) &&
    validMinor(e.amountMinor) &&
    e.amountMinor > 0 &&
    currencies.includes(e.currency) &&
    text(e.toAccountId) &&
    (e.kind === "income"
      ? e.fromAccountId === undefined
      : text(e.fromAccountId) && e.fromAccountId !== e.toAccountId) &&
    typeof e.note === "string" &&
    e.note.length <= 1000 &&
    validDate(e.date) &&
    typeof e.createdAt === "string" &&
    typeof e.updatedAt === "string" &&
    (e.userId === null || typeof e.userId === "string")
  );
}
export function isPlan(value: unknown): value is BudgetPlan {
  if (!value || typeof value !== "object") return false;
  const p = value as BudgetPlan;
  return (
    currencies.includes(p.currency) &&
    validMinor(p.limitMinor) &&
    validMinor(p.savingsReserveMinor) &&
    ["AD", "BS", "payday"].includes(p.mode) &&
    Number.isInteger(p.payday) &&
    p.payday >= 1 &&
    p.payday <= 31 &&
    !!p.categoryLimits &&
    typeof p.categoryLimits === "object" &&
    !Array.isArray(p.categoryLimits) &&
    Object.entries(p.categoryLimits).every(
      ([k, v]) =>
        (categories as readonly string[]).includes(k) && validMinor(v),
    )
  );
}
export function accountBalance(
  account: MoneyAccount,
  state: Ledger,
  asOf: string,
) {
  let balance = account.openingMinor;
  if (account.openingDate > asOf) return 0;
  for (const e of state.entries || []) {
    if (
      e.currency !== account.currency ||
      e.date < account.openingDate ||
      e.date > asOf
    )
      continue;
    if (e.toAccountId === account.id) balance += e.amountMinor;
    if (e.fromAccountId === account.id) balance -= e.amountMinor;
  }
  for (const e of state.expenses) {
    if (
      e.accountId === account.id &&
      e.currency === account.currency &&
      e.date >= account.openingDate &&
      e.date <= asOf
    )
      balance -= e.amountMinor;
  }
  return balance;
}
export function compatibleAccounts(
  state: Ledger,
  currency: Currency,
  method: Expense["paymentMethod"],
) {
  return (state.accounts || []).filter(
    (a) =>
      a.currency === currency &&
      (method === "Cash"
        ? a.kind === "Cash"
        : method === "Bank" || method === "Debit Card"
          ? a.kind === "Bank"
          : method === "eSewa" || method === "Khalti"
            ? a.kind === method
            : method === "Wallet"
              ? a.kind === "Other wallet"
              : false),
  );
}
export function validateLinks(state: Ledger) {
  const accounts = state.accounts || [],
    entries = state.entries || [];
  const findAccount = (id: string, currency: Currency, date?: string) => {
    const a = accounts.find((x) => x.id === id && x.currency === currency);
    if (!a || (date && date < a.openingDate))
      throw Error(
        "An account link is missing, uses a different currency or predates its opening date.",
      );
    return a;
  };
  for (const e of entries) {
    findAccount(e.toAccountId, e.currency, e.date);
    if (e.fromAccountId) findAccount(e.fromAccountId, e.currency, e.date);
  }
  for (const e of state.expenses) {
    if (e.accountId) {
      findAccount(e.accountId, e.currency, e.date);
      if (
        !compatibleAccounts(state, e.currency, e.paymentMethod).some(
          (a) => a.id === e.accountId,
        )
      )
        throw Error("The account does not match the payment method.");
    }
    if (e.paymentMethod === "Credit Card" || e.kind === "transfer") {
      if (
        !e.cardId ||
        !state.cards.some((c) => c.id === e.cardId && c.currency === e.currency)
      )
        throw Error(
          "A linked credit card is missing or uses a different currency.",
        );
    }
  }
  for (const r of state.recurring) {
    if (
      r.accountId &&
      !compatibleAccounts(state, r.currency, r.paymentMethod).some(
        (a) => a.id === r.accountId,
      )
    )
      throw Error("A scheduled payment has an invalid account.");
    if (
      r.paymentMethod === "Credit Card" &&
      (!r.cardId ||
        !state.cards.some(
          (c) => c.id === r.cardId && c.currency === r.currency,
        ))
    )
      throw Error("A scheduled payment has an invalid card.");
  }
}
export function planningSummary(
  state: Ledger,
  currency: Currency,
  today: string,
) {
  const plan =
      state.plans?.find((p) => p.currency === currency) ||
      defaultPlan(currency),
    period = budgetPeriod(today, plan.mode, plan.payday);
  const inPeriod = (date: string) => date >= period.start && date <= today;
  const spent = state.expenses
    .filter((e) => e.currency === currency && isSpending(e) && inPeriod(e.date))
    .reduce((s, e) => s + e.amountMinor, 0);
  const income = (state.entries || [])
    .filter(
      (e) => e.currency === currency && e.kind === "income" && inPeriod(e.date),
    )
    .reduce((s, e) => s + e.amountMinor, 0);
  const cash = (state.accounts || [])
    .filter((a) => a.currency === currency && a.openingDate <= today)
    .reduce((s, a) => s + accountBalance(a, state, today), 0);
  const outstanding = state.cards
    .filter((c) => c.currency === currency)
    .reduce(
      (s, c) =>
        s +
        Math.max(
          0,
          cardBalance(
            c,
            state.expenses.filter((e) => e.date <= today),
          ),
        ),
      0,
    );
  let bills = 0;
  for (const r of state.recurring.filter((r) => r.currency === currency)) {
    let due = r.nextDue,
      remaining = r.remaining ?? 1200,
      guard = 0;
    while (due <= period.end && remaining > 0 && guard++ < 1200) {
      bills += r.amountMinor;
      due = nextMonthlyDate(due, r.dueDay);
      remaining--;
    }
  }
  const available = cash - outstanding - bills - plan.savingsReserveMinor;
  const openings = (state.accounts || [])
    .filter((a) => a.currency === currency && a.openingDate <= today)
    .map((a) => a.openingDate)
    .sort();
  const coverageStart = openings[0] || period.start;
  const unlinked = state.expenses.filter(
    (e) =>
      e.currency === currency &&
      e.paymentMethod !== "Credit Card" &&
      !e.accountId &&
      e.date >= coverageStart &&
      e.date <= today,
  ).length;
  return {
    plan,
    period,
    spent,
    income,
    cash,
    outstanding,
    bills,
    available,
    unlinked,
    hasAccounts: (state.accounts || []).some(
      (a) => a.currency === currency && a.openingDate <= today,
    ),
  };
}
