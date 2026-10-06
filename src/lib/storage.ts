import { Expense, isExpense, Ledger, isCard, isRecurring } from "./expenses";
import {
  emptyLedger,
  isAccount,
  isEntry,
  isPlan,
  validateLinks,
} from "./finance";
// Stable key preserves V1/V2 records; new writes use schema V3.
export const STORAGE_KEY = "kharcha.expenses.v1";
export const RECOVERY_KEY = "kharcha.before-restore";
export interface ExpenseRepository {
  list(): Expense[];
  save(expenses: Expense[]): void;
}
export interface LedgerRepository {
  read(): Ledger;
  write(state: Ledger): void;
}
export function parseLedger(raw: string): Ledger {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw Error(
      "Saved data could not be read. Existing data has been preserved.",
    );
  }
  if (
    !parsed ||
    ![1, 2, 3].includes(parsed.version) ||
    !Array.isArray(parsed.expenses)
  )
    throw Error("This is not a supported Kharcha backup.");
  const base = emptyLedger();
  const state: Ledger = {
    ...base,
    version: 3,
    expenses: parsed.expenses.map((x: Expense) =>
      x && typeof x === "object"
        ? {
            ...x,
            category:
              (x.category as string) === "Home" ? "Household" : x.category,
          }
        : x,
    ),
    cards: parsed.version === 1 ? [] : parsed.cards,
    recurring: parsed.version === 1 ? [] : parsed.recurring,
    accounts: parsed.version === 3 ? parsed.accounts : [],
    entries: parsed.version === 3 ? parsed.entries : [],
    plans: parsed.version === 3 ? parsed.plans : [],
    dateDisplay: parsed.version === 3 ? parsed.dateDisplay : "AD",
  };
  if (
    !state.expenses.every(isExpense) ||
    !Array.isArray(state.cards) ||
    !state.cards.every(isCard) ||
    !Array.isArray(state.recurring) ||
    !state.recurring.every(isRecurring) ||
    !Array.isArray(state.accounts) ||
    !state.accounts.every(isAccount) ||
    !Array.isArray(state.entries) ||
    !state.entries.every(isEntry) ||
    !Array.isArray(state.plans) ||
    !state.plans.every(isPlan) ||
    !["AD", "BS"].includes(state.dateDisplay || "")
  )
    throw Error("Some backup records are invalid. Nothing has been replaced.");
  for (const list of [
    state.expenses,
    state.cards,
    state.recurring,
    state.accounts,
    state.entries,
  ]) {
    if (
      list.length > 50000 ||
      new Set(list.map((x) => x.id)).size !== list.length
    )
      throw Error("Backup contains duplicate IDs or too many records.");
  }
  if (new Set(state.plans.map((p) => p.currency)).size !== state.plans.length)
    throw Error("Backup contains duplicate currency budgets.");
  validateLinks(state);
  return state;
}
export function readLedger(): Ledger {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? parseLedger(raw) : emptyLedger();
}
export function writeLedger(state: Ledger) {
  const normalized = { ...emptyLedger(), ...state, version: 3 };
  parseLedger(JSON.stringify(normalized));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}
export function restoreLedger(raw: string) {
  const next = parseLedger(raw),
    old = localStorage.getItem(STORAGE_KEY);
  if (old !== null) localStorage.setItem(RECOVERY_KEY, old);
  writeLedger(next);
  return next;
}
export const localLedgerRepository: LedgerRepository = {
  read: readLedger,
  write: writeLedger,
};
export const localExpenseRepository: ExpenseRepository = {
  list: () => readLedger().expenses,
  save: (expenses) => writeLedger({ ...readLedger(), expenses }),
};
