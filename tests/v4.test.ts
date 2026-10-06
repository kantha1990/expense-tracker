import test from "node:test";
import assert from "node:assert/strict";
import { Expense, Ledger, totals, cardBalance } from "../src/lib/expenses";
import {
  accountBalance,
  emptyLedger,
  MoneyAccount,
  planningSummary,
} from "../src/lib/finance";
import {
  addDebtEvent,
  Debt,
  DebtEvent,
  debtBalance,
  removeDebtEvent,
} from "../src/lib/debts";
import {
  alreadyImported,
  applyStatement,
  defaultChoices,
  detectDelimiter,
  guessMapping,
  normalizeStatement,
  parseCSV,
  possibleMatches,
  statementAmount,
  statementDate,
} from "../src/lib/imports";
import { parseLedger } from "../src/lib/storage";
const today = "2026-10-06";
const bank: MoneyAccount = {
  id: "bank",
  name: "My bank",
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
const base = (): Ledger => ({ ...emptyLedger(), accounts: [bank, wallet] });
const debt = (
  direction: Debt["direction"] = "lent",
  openingMinor = 0,
): Debt => ({
  id: "d",
  person: "Friend",
  direction,
  currency: "NPR",
  openingMinor,
  date: "2026-10-01",
  dueDate: "2026-10-20",
  note: "",
  createdAt: "now",
  updatedAt: "now",
  userId: null,
});
const event = (
  kind: DebtEvent["kind"] = "advance",
  principalMinor = 300000,
  interestMinor = 0,
): DebtEvent => ({
  id: crypto.randomUUID(),
  debtId: "d",
  kind,
  principalMinor,
  interestMinor,
  accountId: "bank",
  date: today,
  note: "",
  createdAt:
    kind === "advance" ? "2026-10-06T01:00:00Z" : "2026-10-06T02:00:00Z",
  updatedAt: "now",
  userId: null,
});
const csv =
  "Date,Description,Debit,Credit,Reference,Currency\n2026-10-06,Groceries,800,,G-1,NPR\n2026-10-06,Salary,,2000,S-1,NPR\n2026-10-06,Wallet loading,1000,,T-1,NPR";
const mapping = () => guessMapping(parseCSV(csv)[0]);
test("lending and principal repayments change cash/debt but never ordinary spending or income", () => {
  let s = { ...base(), debts: [debt()] };
  s = addDebtEvent(s, event()) as typeof s;
  assert.equal(debtBalance(s.debts[0], s), 300000);
  assert.equal(accountBalance(bank, s, today), 700000);
  s = addDebtEvent(s, event("repayment", 100000)) as typeof s;
  assert.equal(debtBalance(s.debts[0], s), 200000);
  assert.equal(accountBalance(bank, s, today), 800000);
  assert.equal(totals(s.expenses, today, "NPR").month, 0);
  assert.equal(planningSummary(s, "NPR", today).income, 0);
});
test("borrowing is a liability; partial repayment with interest counts only interest as spending", () => {
  let s: Ledger = { ...base(), debts: [debt("borrowed")] };
  s = addDebtEvent(s, event());
  assert.equal(accountBalance(bank, s, today), 1300000);
  assert.equal(planningSummary(s, "NPR", today).income, 0);
  assert.equal(planningSummary(s, "NPR", today).borrowedDue, 300000);
  assert.equal(planningSummary(s, "NPR", today).available, 1000000);
  s = addDebtEvent(s, event("repayment", 100000, 5000));
  assert.equal(accountBalance(bank, s, today), 1195000);
  assert.equal(debtBalance(s.debts![0], s), 200000);
  assert.equal(totals(s.expenses, today, "NPR").month, 5000);
  assert.equal(planningSummary(s, "NPR", today).available, 995000);
  assert.equal(parseLedger(JSON.stringify(s)).debtEvents!.length, 2);
});
test("interest received is income once; deleting repayment removes its linked interest atomically", () => {
  let s: Ledger = { ...base(), debts: [debt()] };
  s = addDebtEvent(s, event());
  const repay = event("repayment", 300000, 10000);
  s = addDebtEvent(s, repay);
  assert.equal(accountBalance(bank, s, today), 1010000);
  assert.equal(planningSummary(s, "NPR", today).income, 10000);
  assert.equal(debtBalance(s.debts![0], s), 0);
  const undo = removeDebtEvent(s, repay.id);
  assert.equal(undo.entries!.length, 0);
  assert.equal(accountBalance(bank, undo, today), 700000);
  assert.equal(debtBalance(undo.debts![0], undo), 300000);
});
test("reject overpayment, invalid chronology, dangling interest and removal of a funding advance with dependent repayments", () => {
  let s: Ledger = { ...base(), debts: [debt()] };
  const funding = event();
  s = addDebtEvent(s, funding);
  s = addDebtEvent(s, event("repayment", 200000));
  assert.throws(() => addDebtEvent(s, event("repayment", 200000)), /exceeds/);
  assert.throws(() => removeDebtEvent(s, funding.id), /exceeds/);
  assert.throws(
    () => addDebtEvent(s, { ...event("repayment", 1), date: "2026-09-01" }),
    /invalid/,
  );
  let interestState: Ledger = { ...base(), debts: [debt("borrowed", 300000)] };
  interestState = addDebtEvent(
    interestState,
    event("repayment", 100000, 10000),
  );
  assert.throws(
    () => parseLedger(JSON.stringify({ ...interestState, expenses: [] })),
    /interest expense/,
  );
  assert.throws(
    () => parseLedger(JSON.stringify({ ...interestState, debtEvents: [] })),
    /missing its Udharo/,
  );
});
test("existing debts never move opening cash; unknown due dates warn and future debts are not reserved", () => {
  const s: Ledger = {
    ...base(),
    debts: [{ ...debt("borrowed", 200000), dueDate: undefined }],
  };
  assert.equal(accountBalance(bank, s, today), 1000000);
  assert.equal(planningSummary(s, "NPR", today).unscheduledBorrowed, 1);
  assert.equal(planningSummary(s, "NPR", today).borrowedDue, 0);
  s.debts![0].dueDate = "2026-11-01";
  assert.equal(planningSummary(s, "NPR", today).borrowedDue, 0);
});
test("CSV handles BOM, quotes, escaped quotes, quoted newlines, semicolons and tabs", () => {
  const text =
    '\uFEFFDate;Description;Debit;Credit\r\n2026-10-06;"Shop, \"\"A\"\"\nFloor 1";100;\r\n';
  assert.equal(detectDelimiter(text), ";");
  const rows = parseCSV(text, ";");
  assert.equal(rows[1][1], 'Shop, "A"\nFloor 1');
  assert.equal(
    detectDelimiter("Date\tDescription\tAmount\n2026-10-06\tShop\t-10"),
    "\t",
  );
  assert.throws(() => parseCSV('a,b\n"bad,2'), /not closed/);
  assert.throws(() => parseCSV('a,b\n"x"bad,2'), /Unexpected/);
});
test("date and amount normalization requires explicit format and rejects invalid currency/precision", () => {
  assert.equal(statementDate("06/10/2026", "DMY"), today);
  assert.equal(statementDate("10/06/2026", "MDY"), today);
  assert.equal(statementDate("२०८३/०६/२०", "BS"), today);
  assert.throws(() => statementDate("31/02/2026", "DMY"));
  assert.equal(statementAmount("(NPR 1,250.50)", "NPR"), -125050);
  assert.equal(statementAmount("रु १,००,०००.२५", "NPR"), 10000025);
  assert.equal(statementAmount("100.00 DR", "NPR"), -10000);
  assert.throws(() => statementAmount("USD 10", "NPR"), /currency/);
  assert.throws(() => statementAmount("1,50", "NPR"), /grouping/);
  assert.throws(() => statementAmount("12.345", "NPR"));
});
test("import preview rejects future/pre-opening dates, mixed currency, malformed columns and debit+credit rows", async () => {
  const input =
    "Date,Description,Debit,Credit,Currency\n2026-09-30,Old,10,,NPR\n2090-01-01,Future,10,,NPR\n2026-10-06,Mixed,10,,USD\n2026-10-06,Both,10,20,NPR\n2026-10-06,Short,10";
  const rows = await normalizeStatement(
    input,
    guessMapping(parseCSV(input)[0]),
    bank,
    today,
  );
  assert.equal(rows.filter((r) => r.error).length, 5);
  assert.throws(() => parseCSV("a".repeat(2 * 1024 * 1024 + 1)), /2 MB/);
});
test("statement incoming requires review; selected expense/income/transfer import changes balances correctly and is atomic", async () => {
  const s = base(),
    rows = await normalizeStatement(csv, mapping(), bank, today),
    choices = defaultChoices(s, rows, bank.id);
  assert.equal(choices[1].kind, "review");
  assert.equal(choices[1].selected, false);
  choices[1].selected = true;
  assert.throws(
    () => applyStatement(s, bank.id, choices, "Test"),
    /incoming payment/,
  );
  assert.equal(s.expenses.length, 0);
  choices[1].kind = "income";
  choices[2].kind = "transfer";
  choices[2].otherAccountId = wallet.id;
  const imported = applyStatement(s, bank.id, choices, "Test");
  assert.equal(imported.added, 3);
  assert.equal(accountBalance(bank, imported.state, today), 1020000);
  assert.equal(accountBalance(wallet, imported.state, today), 100000);
  assert.equal(totals(imported.state.expenses, today, "NPR").month, 80000);
  assert.equal(planningSummary(imported.state, "NPR", today).income, 200000);
  assert.equal(parseLedger(JSON.stringify(imported.state)).imports!.length, 1);
});
test("repeat imports and reordered reference rows are idempotent, including after backup round-trip", async () => {
  const s = base(),
    rows = await normalizeStatement(csv, mapping(), bank, today),
    choices = defaultChoices(s, rows, bank.id);
  choices[1].kind = "income";
  choices[1].selected = true;
  choices[2].kind = "transfer";
  choices[2].otherAccountId = wallet.id;
  const imported = parseLedger(
    JSON.stringify(applyStatement(s, bank.id, choices, "Test").state),
  );
  assert.ok(rows.every((r) => alreadyImported(imported, r.key)));
  assert.ok(defaultChoices(imported, rows, bank.id).every((c) => !c.selected));
  const reordered = csv.split("\n");
  const again = await normalizeStatement(
    [reordered[0], ...reordered.slice(1).reverse()].join("\n"),
    mapping(),
    bank,
    today,
  );
  assert.ok(again.every((r) => alreadyImported(imported, r.key)));
  assert.throws(
    () => applyStatement(imported, bank.id, choices, "Again"),
    /already/,
  );
});
test("matching a transfer from the receiving-account statement attaches identity without moving money twice", async () => {
  const rows = await normalizeStatement(csv, mapping(), bank, today);
  const choices = defaultChoices(base(), rows, bank.id);
  choices[0].selected = false;
  choices[2].kind = "transfer";
  choices[2].otherAccountId = wallet.id;
  let s = applyStatement(base(), bank.id, choices, "Bank").state;
  const other =
    "Date,Description,Debit,Credit,Reference,Currency\n2026-10-06,Money received,,1000,W-1,NPR";
  const inbound = await normalizeStatement(other, mapping(), wallet, today),
    review = defaultChoices(s, inbound, wallet.id);
  assert.equal(review[0].duplicateDecision, "pending");
  const match = possibleMatches(s, inbound[0], wallet.id)[0];
  review[0].duplicateDecision = "link";
  review[0].matchId = `${match.target}:${match.id}`;
  review[0].selected = true;
  const linked = applyStatement(s, wallet.id, review, "Wallet");
  assert.equal(linked.linked, 1);
  assert.equal(linked.state.entries!.length, 1);
  assert.equal(accountBalance(bank, linked.state, today), 900000);
  assert.equal(accountBalance(wallet, linked.state, today), 100000);
  assert.equal(linked.state.entries![0].importKeys!.length, 2);
});
test("unlinked manual expenses can be matched and linked without duplicating spending", async () => {
  const e: Expense = {
    id: "manual",
    amountMinor: 80000,
    currency: "NPR",
    category: "Household",
    paymentMethod: "Cash",
    note: "Groceries",
    date: today,
    createdAt: "now",
    updatedAt: "now",
    userId: null,
  };
  const s = { ...base(), expenses: [e] };
  const rows = await normalizeStatement(csv, mapping(), bank, today),
    choices = defaultChoices(s, rows, bank.id);
  assert.equal(choices[0].duplicateDecision, "pending");
  choices.forEach((c) => (c.selected = false));
  choices[0].selected = true;
  choices[0].duplicateDecision = "link";
  choices[0].matchId = "expense:manual";
  const result = applyStatement(s, bank.id, choices, "Test");
  assert.equal(result.state.expenses.length, 1);
  assert.equal(result.state.expenses[0].accountId, bank.id);
  assert.equal(totals(result.state.expenses, today, "NPR").month, 80000);
  assert.equal(accountBalance(bank, result.state, today), 920000);
});
test("new matches appearing after preview require re-review", async () => {
  const s = base(),
    rows = await normalizeStatement(csv, mapping(), bank, today),
    choices = defaultChoices(s, rows, bank.id);
  choices.forEach((c, i) => (c.selected = i === 0));
  const e: Expense = {
    id: "new",
    amountMinor: 80000,
    currency: "NPR",
    category: "Other",
    paymentMethod: "Bank",
    accountId: bank.id,
    note: "New expense",
    date: today,
    createdAt: "now",
    updatedAt: "now",
    userId: null,
  };
  assert.throws(
    () => applyStatement({ ...s, expenses: [e] }, bank.id, choices, "Test"),
    /New possible matches/,
  );
});
test("identical rows without references require a separate-transaction decision, then stay distinct on re-import", async () => {
  const input =
    "Date,Description,Amount\n2026-10-06,Tea,-50\n2026-10-06,Tea,-50";
  const rows = await normalizeStatement(
      input,
      guessMapping(parseCSV(input)[0]),
      bank,
      today,
    ),
    choices = defaultChoices(base(), rows, bank.id);
  assert.notEqual(rows[0].key, rows[1].key);
  assert.equal(choices[1].duplicateDecision, "pending");
  choices[1].selected = true;
  choices[1].duplicateDecision = "new";
  const result = applyStatement(base(), bank.id, choices, "Tea");
  assert.equal(result.added, 2);
  assert.ok(
    defaultChoices(result.state, rows, bank.id).every((c) => !c.selected),
  );
});
test("imports can record borrowed repayments and credit card repayments without principal becoming spending", async () => {
  const input =
    "Date,Description,Debit,Credit,Reference,Currency\n2026-10-06,Friend repayment,1050,,D-1,NPR\n2026-10-06,Card bill,1500,,C-1,NPR";
  const s: Ledger = {
    ...base(),
    debts: [debt("borrowed", 300000)],
    cards: [
      {
        id: "c",
        name: "Card",
        currency: "NPR",
        openingBalanceMinor: 200000,
        dueDay: 15,
      },
    ],
  };
  const rows = await normalizeStatement(input, mapping(), bank, today),
    choices = defaultChoices(s, rows, bank.id);
  choices[0].kind = "debt";
  choices[0].debtId = "d";
  choices[0].interestMinor = 5000;
  choices[1].kind = "card";
  choices[1].cardId = "c";
  const result = applyStatement(s, bank.id, choices, "Payments").state;
  assert.equal(accountBalance(bank, result, today), 745000);
  assert.equal(debtBalance(result.debts![0], result), 200000);
  assert.equal(cardBalance(result.cards[0], result.expenses), 50000);
  assert.equal(totals(result.expenses, today, "NPR").month, 5000);
  assert.equal(parseLedger(JSON.stringify(result)).imports!.length, 1);
});
test("V3 migration preserves balances and V4 backup rejects duplicate import identities and dangling account links", () => {
  const s = base();
  const migrated = parseLedger(
    JSON.stringify({
      ...s,
      version: 3,
      debts: undefined,
      debtEvents: undefined,
      imports: undefined,
    }),
  );
  assert.equal(migrated.version, 4);
  assert.equal(migrated.accounts!.length, 2);
  assert.deepEqual(migrated.debts, []);
  const e: Expense = {
    id: "e",
    amountMinor: 100,
    currency: "NPR",
    category: "Other",
    paymentMethod: "Bank",
    accountId: "bank",
    note: "",
    date: today,
    createdAt: "now",
    updatedAt: "now",
    userId: null,
    importKeys: ["key"],
  };
  assert.throws(
    () =>
      parseLedger(
        JSON.stringify({ ...s, expenses: [e, { ...e, id: "other" }] }),
      ),
    /Duplicate import/,
  );
  assert.throws(
    () =>
      parseLedger(
        JSON.stringify({
          ...s,
          imports: [
            {
              id: "batch",
              name: "Test",
              accountId: "missing",
              currency: "NPR",
              rowCount: 1,
              createdAt: "now",
            },
          ],
        }),
      ),
    /account link/,
  );
});
