import {
  Currency,
  currencies,
  Expense,
  Ledger,
  localDate,
  validDate,
  validRecordMeta,
} from "./expenses";
import { MoneyEntry, validMinor } from "./finance";
export type Debt = {
  id: string;
  person: string;
  direction: "lent" | "borrowed";
  currency: Currency;
  openingMinor: number;
  date: string;
  dueDate?: string;
  note: string;
  createdAt: string;
  updatedAt: string;
  userId: string | null;
};
export type DebtEvent = {
  id: string;
  debtId: string;
  kind: "advance" | "repayment";
  principalMinor: number;
  interestMinor: number;
  accountId: string;
  date: string;
  note: string;
  createdAt: string;
  updatedAt: string;
  userId: string | null;
  importKeys?: string[];
  importBatchId?: string;
};
const text = (v: unknown) =>
  typeof v === "string" && v.length > 0 && v.length <= 200;
export function isDebt(x: unknown): x is Debt {
  if (!x || typeof x !== "object") return false;
  const d = x as Debt;
  return (
    text(d.id) &&
    text(d.person) &&
    ["lent", "borrowed"].includes(d.direction) &&
    currencies.includes(d.currency) &&
    validMinor(d.openingMinor) &&
    validDate(d.date) &&
    (d.dueDate === undefined ||
      (validDate(d.dueDate) && d.dueDate >= d.date)) &&
    typeof d.note === "string" &&
    d.note.length <= 1000 &&
    typeof d.createdAt === "string" &&
    typeof d.updatedAt === "string" &&
    (d.userId === null || typeof d.userId === "string")
  );
}
export function isDebtEvent(x: unknown): x is DebtEvent {
  if (!x || typeof x !== "object") return false;
  const e = x as DebtEvent;
  return (
    text(e.id) &&
    text(e.debtId) &&
    ["advance", "repayment"].includes(e.kind) &&
    validMinor(e.principalMinor) &&
    validMinor(e.interestMinor) &&
    e.principalMinor + e.interestMinor > 0 &&
    (e.kind !== "advance" || (e.principalMinor > 0 && e.interestMinor === 0)) &&
    validRecordMeta(e) &&
    text(e.accountId) &&
    validDate(e.date) &&
    typeof e.note === "string" &&
    e.note.length <= 1000 &&
    typeof e.createdAt === "string" &&
    typeof e.updatedAt === "string" &&
    (e.userId === null || typeof e.userId === "string") &&
    (e.importKeys === undefined ||
      (Array.isArray(e.importKeys) &&
        e.importKeys.every((k) => typeof k === "string" && k.length <= 100))) &&
    (e.importBatchId === undefined || text(e.importBatchId))
  );
}
export function debtBalance(debt: Debt, state: Ledger, asOf = "9999-12-31") {
  return (state.debtEvents || [])
    .filter((e) => e.debtId === debt.id && e.date <= asOf)
    .reduce(
      (sum, e) =>
        sum + (e.kind === "advance" ? e.principalMinor : -e.principalMinor),
      debt.openingMinor,
    );
}
export function eventDirection(
  debt: Debt,
  event: Pick<DebtEvent, "kind">,
): "in" | "out" {
  return (debt.direction === "borrowed") === (event.kind === "advance")
    ? "in"
    : "out";
}
export function debtCashChange(debt: Debt, event: DebtEvent) {
  return (eventDirection(debt, event) === "in" ? 1 : -1) * event.principalMinor;
}
export function accountMethod(
  state: Ledger,
  id: string,
): Expense["paymentMethod"] {
  const a = state.accounts?.find((a) => a.id === id);
  if (!a) throw Error("Choose an existing account.");
  return a.kind === "Other wallet" ? "Wallet" : a.kind;
}
export function addDebtEvent(state: Ledger, event: DebtEvent): Ledger {
  const debt = state.debts?.find((d) => d.id === event.debtId);
  if (!debt) throw Error("This Udharo record no longer exists.");
  if (event.date > localDate()) throw Error("Choose today or a past date.");
  const next = { ...state, debtEvents: [...(state.debtEvents || []), event] };
  if (event.kind === "repayment" && event.interestMinor > 0) {
    if (debt.direction === "borrowed") {
      const expense: Expense = {
        id: `${event.id}:interest`,
        amountMinor: event.interestMinor,
        currency: debt.currency,
        category: "Other",
        subcategory: "Udharo interest",
        paymentMethod: accountMethod(state, event.accountId),
        accountId: event.accountId,
        note: `Interest paid to ${debt.person}`,
        date: event.date,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
        userId: null,
        kind: "expense",
        debtEventId: event.id,
      };
      next.expenses = [...state.expenses, expense];
    } else {
      const income: MoneyEntry = {
        id: `${event.id}:interest`,
        kind: "income",
        amountMinor: event.interestMinor,
        currency: debt.currency,
        toAccountId: event.accountId,
        note: `Interest received from ${debt.person}`,
        date: event.date,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
        userId: null,
        debtEventId: event.id,
      };
      next.entries = [...(state.entries || []), income];
    }
  }
  validateDebts(next);
  return next;
}
export function removeDebtEvent(state: Ledger, id: string): Ledger {
  const next = {
    ...state,
    debtEvents: (state.debtEvents || []).filter((e) => e.id !== id),
    expenses: state.expenses.filter((e) => e.debtEventId !== id),
    entries: (state.entries || []).filter((e) => e.debtEventId !== id),
  };
  validateDebts(next);
  return next;
}
export function validateDebts(state: Ledger) {
  const debts = state.debts || [],
    events = state.debtEvents || [];
  for (const e of events) {
    const d = debts.find((d) => d.id === e.debtId),
      a = state.accounts?.find((a) => a.id === e.accountId);
    if (
      !d ||
      !a ||
      d.currency !== a.currency ||
      e.date < d.date ||
      e.date < a.openingDate
    )
      throw Error(
        "An Udharo event has an invalid debt/account link, currency or date.",
      );
  }
  for (const d of debts) {
    let balance = d.openingMinor;
    const ordered = events
      .filter((e) => e.debtId === d.id)
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          a.createdAt.localeCompare(b.createdAt) ||
          (a.kind === "advance" ? -1 : 1),
      );
    for (const e of ordered) {
      balance += e.kind === "advance" ? e.principalMinor : -e.principalMinor;
      if (balance < 0)
        throw Error(
          "A principal repayment exceeds the outstanding Udharo at that date.",
        );
    }
  }
  for (const e of events) {
    const d = debts.find((d) => d.id === e.debtId)!;
    const expenses = state.expenses.filter((x) => x.debtEventId === e.id),
      entries = (state.entries || []).filter((x) => x.debtEventId === e.id);
    if (e.interestMinor === 0) {
      if (expenses.length || entries.length)
        throw Error("An Udharo event has unexpected interest records.");
      continue;
    }
    if (d.direction === "borrowed") {
      const x = expenses[0];
      if (
        expenses.length !== 1 ||
        entries.length ||
        !x ||
        x.amountMinor !== e.interestMinor ||
        x.accountId !== e.accountId ||
        x.currency !== d.currency ||
        x.date !== e.date ||
        x.kind === "transfer"
      )
        throw Error("Udharo interest expense does not match its repayment.");
    } else {
      const x = entries[0];
      if (
        entries.length !== 1 ||
        expenses.length ||
        !x ||
        x.amountMinor !== e.interestMinor ||
        x.toAccountId !== e.accountId ||
        x.currency !== d.currency ||
        x.date !== e.date ||
        x.kind !== "income"
      )
        throw Error("Udharo interest income does not match its repayment.");
    }
  }
  for (const x of [...state.expenses, ...(state.entries || [])])
    if (x.debtEventId && !events.some((e) => e.id === x.debtEventId))
      throw Error("An interest record is missing its Udharo repayment.");
}
