import {
  Category,
  categories,
  Currency,
  currencies,
  Expense,
  Ledger,
  localDate,
  parseAmount,
  validDate,
  validRecordMeta,
  cardBalance,
} from "./expenses";
import { MoneyAccount, MoneyEntry } from "./finance";
import {
  accountMethod,
  addDebtEvent,
  DebtEvent,
  eventDirection,
} from "./debts";
import { fromBS, latinDigits } from "./calendar";
export type ImportBatch = {
  id: string;
  name: string;
  accountId: string;
  currency: Currency;
  createdAt: string;
  rowCount: number;
};
export type ImportMapping = {
  date: number;
  description: number;
  amount: number;
  debit: number;
  credit: number;
  reference: number;
  currency: number;
  dateFormat: "YMD" | "DMY" | "MDY" | "BS";
  amountMode: "separate" | "signed" | "outgoing";
  delimiter: "," | ";" | "\t";
  headerRow: number;
};
export type StatementRow = {
  id: string;
  line: number;
  date: string;
  description: string;
  reference: string;
  amountMinor: number;
  direction: "in" | "out";
  currency: Currency;
  key: string;
  error: string;
  withinFileDuplicate: boolean;
};
export type ImportChoice = {
  row: StatementRow;
  selected: boolean;
  kind: "expense" | "income" | "transfer" | "debt" | "card" | "review" | "skip";
  category: Category;
  otherAccountId: string;
  debtId: string;
  cardId: string;
  matchSnapshot: string[];
  debtKind: "advance" | "repayment";
  interestMinor: number;
  duplicateDecision: "pending" | "new" | "link" | "skip";
  matchId: string;
};
export type ExistingMovement = {
  id: string;
  target: "expense" | "entry" | "debt";
  date: string;
  amountMinor: number;
  direction: "in" | "out";
  accountId: string;
  currency: Currency;
  note: string;
  keys: string[];
};
export function isImportBatch(x: unknown): x is ImportBatch {
  if (!x || typeof x !== "object") return false;
  const b = x as ImportBatch;
  return (
    typeof b.id === "string" &&
    b.id.length > 0 &&
    typeof b.name === "string" &&
    b.name.length <= 200 &&
    typeof b.accountId === "string" &&
    currencies.includes(b.currency) &&
    typeof b.createdAt === "string" &&
    Number.isInteger(b.rowCount) &&
    b.rowCount >= 0 &&
    b.rowCount <= 2000
  );
}
export function parseCSV(
  raw: string,
  delimiter: "," | ";" | "\t" = ",",
): string[][] {
  if (raw.length > 2 * 1024 * 1024)
    throw Error("Statement text must be smaller than 2 MB.");
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const text = raw.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
      continue;
    }
    if (c === '"') {
      if (cell.trim() || closed)
        throw Error(
          "Malformed CSV quotes. Export CSV again or use the template.",
        );
      cell = "";
      quoted = true;
      continue;
    }
    if (c === delimiter) {
      row.push(cell);
      cell = "";
      closed = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
      closed = false;
      if (rows.length > 2021)
        throw Error("Import at most 2,000 transactions at a time.");
    } else {
      if (closed && !/\s/.test(c))
        throw Error("Unexpected text after a quoted CSV field.");
      if (!closed) cell += c;
    }
  }
  if (quoted) throw Error("A quoted CSV field is not closed.");
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}
export function detectDelimiter(raw: string): "," | ";" | "\t" {
  const candidates = ([",", ";", "\t"] as const)
    .map((d) => {
      try {
        return {
          d,
          n: parseCSV(raw, d)
            .slice(0, 10)
            .reduce((s, r) => s + r.length, 0),
        };
      } catch {
        return { d, n: -1 };
      }
    })
    .sort((a, b) => b.n - a.n);
  if (candidates[0].n < 0)
    throw Error("Could not read CSV. Check separators and quoted fields.");
  return candidates[0].d;
}
export function guessMapping(
  headers: string[],
  delimiter: ImportMapping["delimiter"] = ",",
): ImportMapping {
  const find = (re: RegExp) => headers.findIndex((h) => re.test(h.trim()));
  return {
    date: find(/^(transaction\s*date|txn\s*date|value\s*date|date|मिति)$/i),
    description: find(
      /^(description|narration|particulars|details|remarks|note)$/i,
    ),
    amount: find(/^(amount|transaction\s*amount|signed\s*amount)$/i),
    debit: find(/^(debit(?:\s*amount)?|withdrawal(?:s)?|paid|outgoing)$/i),
    credit: find(/^(credit(?:\s*amount)?|deposit(?:s)?|received|incoming)$/i),
    reference: find(
      /^(reference(?:\s*id)?|ref|transaction\s*(id|ref)|txn\s*id)$/i,
    ),
    currency: find(/^currency$/i),
    dateFormat: "YMD",
    amountMode:
      find(/^(debit(?:\s*amount)?|withdrawal(?:s)?|paid|outgoing)$/i) >= 0
        ? "separate"
        : "signed",
    delimiter,
    headerRow: 0,
  };
}
export function statementDate(
  raw: string,
  format: ImportMapping["dateFormat"],
): string {
  const value = latinDigits(raw.trim()).split(/[T ]/)[0];
  const m = value.match(/^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$/);
  if (!m) throw Error("Date does not match the selected numeric format.");
  if (format === "BS") return fromBS(`${m[1]}-${m[2]}-${m[3]}`);
  const [y, mo, d] =
    format === "YMD"
      ? [m[1], m[2], m[3]]
      : format === "DMY"
        ? [m[3], m[2], m[1]]
        : [m[3], m[1], m[2]];
  if (y.length !== 4) throw Error("Use four-digit years.");
  const date = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  if (!validDate(date)) throw Error("That date does not exist.");
  return date;
}
export function statementAmount(raw: string, currency: Currency): number {
  let v = latinDigits(raw.trim());
  if (!v || v === "-") return 0;
  const code = v.match(/\b(NPR|INR|USD)\b/i)?.[1].toUpperCase();
  if ((code && code !== currency) || (v.includes("$") && currency !== "USD"))
    throw Error("Amount currency differs from the selected account.");
  let negative = /^-|^\(|\bDR\s*$/i.test(v);
  v = v
    .replace(/\b(NPR|INR|USD|DR|CR)\b|Rs\.?|रु\.?|\$/gi, "")
    .trim()
    .replace(/[()]/g, "")
    .replace(/^[-+]/, "")
    .trim();
  if (v.includes(",")) {
    if (
      !/^(?:\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/.test(v)
    )
      throw Error("Amount uses an unsupported decimal/grouping format.");
    v = v.replaceAll(",", "");
  }
  if (/^0(?:\.0{1,2})?$/.test(v)) return 0;
  return parseAmount(v) * (negative ? -1 : 1);
}
async function hash(value: string) {
  const data = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(data), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
export async function normalizeStatement(
  raw: string,
  mapping: ImportMapping,
  account: MoneyAccount,
  today = localDate(),
): Promise<StatementRow[]> {
  const csv = parseCSV(raw, mapping.delimiter),
    headers = csv[mapping.headerRow];
  if (!headers || mapping.date < 0 || mapping.description < 0)
    throw Error("Map the date and description columns.");
  if (
    (mapping.amountMode === "separate" &&
      (mapping.debit < 0 || mapping.credit < 0)) ||
    (mapping.amountMode !== "separate" && mapping.amount < 0)
  )
    throw Error("Map the amount columns for the chosen amount layout.");
  const indexes = [
    mapping.date,
    mapping.description,
    mapping.amountMode === "separate" ? mapping.debit : mapping.amount,
    ...(mapping.amountMode === "separate" ? [mapping.credit] : []),
  ];
  if (
    new Set(indexes).size !== indexes.length ||
    indexes.some((i) => i >= headers.length)
  )
    throw Error(
      "Date, description and amount columns must be different valid columns.",
    );
  const data = csv.slice(mapping.headerRow + 1);
  if (!data.length || data.length > 2000)
    throw Error("Choose a statement with 1–2,000 transactions.");
  const seen = new Map<string, number>();
  const rows: StatementRow[] = [];
  for (let i = 0; i < data.length; i++) {
    const cells = data[i],
      get = (index: number) => (index < 0 ? "" : (cells[index] || "").trim());
    const r: StatementRow = {
      id: String(i),
      line: mapping.headerRow + i + 2,
      date: "",
      description: get(mapping.description),
      reference: get(mapping.reference),
      amountMinor: 0,
      direction: "out",
      currency: account.currency,
      key: "",
      error: "",
      withinFileDuplicate: false,
    };
    try {
      if (cells.length !== headers.length)
        throw Error("Column count differs from the header.");
      r.date = statementDate(get(mapping.date), mapping.dateFormat);
      if (r.date > today)
        throw Error("Future transactions cannot be imported.");
      if (r.date < account.openingDate)
        throw Error("Date is before this account’s opening date.");
      const cur = get(mapping.currency).toUpperCase();
      if (cur && cur !== account.currency)
        throw Error("Currency differs from this account.");
      if (mapping.amountMode === "separate") {
        const debit = statementAmount(get(mapping.debit), account.currency),
          credit = statementAmount(get(mapping.credit), account.currency);
        if (debit < 0 || credit < 0 || (debit > 0 && credit > 0))
          throw Error("Use one positive debit or credit amount per row.");
        r.amountMinor = debit || credit;
        r.direction = debit ? "out" : "in";
      } else {
        const amount = statementAmount(get(mapping.amount), account.currency);
        r.amountMinor = Math.abs(amount);
        r.direction =
          mapping.amountMode === "outgoing" ? "out" : amount < 0 ? "out" : "in";
        if (mapping.amountMode === "outgoing" && amount < 0)
          throw Error("Outgoing-only amounts must be positive.");
      }
      if (!r.amountMinor) throw Error("Row has no non-zero amount.");
      if (r.description.length > 1000 || r.reference.length > 200)
        throw Error("Description or reference is too long.");
      const base = JSON.stringify([
        account.id,
        account.currency,
        r.date,
        r.direction,
        ...(r.reference
          ? ["ref", r.reference]
          : [
              "row",
              r.amountMinor,
              r.description
                .normalize("NFKC")
                .trim()
                .replace(/\s+/g, " ")
                .toLowerCase(),
            ]),
      ]);
      const count = (seen.get(base) || 0) + 1;
      seen.set(base, count);
      r.withinFileDuplicate = count > 1;
      r.key = await hash(base + (r.reference ? "" : `:${count}`));
    } catch (e) {
      r.error = (e as Error).message;
    }
    rows.push(r);
  }
  return rows;
}
export function existingMovements(state: Ledger): ExistingMovement[] {
  const moves: ExistingMovement[] = [];
  for (const e of state.expenses) {
    if (e.debtEventId || e.paymentMethod === "Credit Card") continue;
    moves.push({
      id: e.id,
      target: "expense",
      date: e.date,
      amountMinor: e.amountMinor,
      direction: "out",
      accountId: e.accountId || "",
      currency: e.currency,
      note: e.note,
      keys: e.importKeys || [],
    });
  }
  for (const e of state.entries || []) {
    if (e.debtEventId) continue;
    for (const [id, direction] of [
      [e.toAccountId, "in"],
      [e.fromAccountId, "out"],
    ] as const) {
      if (id)
        moves.push({
          id: e.id,
          target: "entry",
          date: e.date,
          amountMinor: e.amountMinor,
          direction,
          accountId: id,
          currency: e.currency,
          note: e.note,
          keys: e.importKeys || [],
        });
    }
  }
  for (const e of state.debtEvents || []) {
    const d = state.debts?.find((d) => d.id === e.debtId);
    if (d)
      moves.push({
        id: e.id,
        target: "debt",
        date: e.date,
        amountMinor: e.principalMinor + e.interestMinor,
        direction: eventDirection(d, e),
        accountId: e.accountId,
        currency: d.currency,
        note: e.note || d.person,
        keys: e.importKeys || [],
      });
  }
  return moves;
}
export function possibleMatches(
  state: Ledger,
  row: StatementRow,
  accountId: string,
) {
  return existingMovements(state).filter(
    (e) =>
      (e.accountId === accountId || (e.target === "expense" && !e.accountId)) &&
      e.currency === row.currency &&
      e.date === row.date &&
      e.direction === row.direction &&
      e.amountMinor === row.amountMinor,
  );
}
export function alreadyImported(state: Ledger, key: string) {
  return [
    ...state.expenses,
    ...(state.entries || []),
    ...(state.debtEvents || []),
  ].some((e) => e.importKeys?.includes(key));
}
export function defaultChoices(
  state: Ledger,
  rows: StatementRow[],
  accountId: string,
): ImportChoice[] {
  return rows.map((row) => {
    const known = alreadyImported(state, row.key),
      possible = possibleMatches(state, row, accountId);
    return {
      row,
      selected:
        !row.error &&
        !known &&
        !row.withinFileDuplicate &&
        possible.length === 0 &&
        row.direction === "out",
      kind: row.direction === "out" ? "expense" : "review",
      category: "Other",
      otherAccountId: "",
      debtId: "",
      cardId: "",
      matchSnapshot: possible.map((m) => `${m.target}:${m.id}`),
      debtKind: "repayment",
      interestMinor: 0,
      duplicateDecision: known
        ? "skip"
        : possible.length || row.withinFileDuplicate
          ? "pending"
          : "new",
      matchId: "",
    };
  });
}
export function applyStatement(
  state: Ledger,
  accountId: string,
  choices: ImportChoice[],
  name: string,
): { state: Ledger; added: number; linked: number; skipped: number } {
  const account = state.accounts?.find((a) => a.id === accountId);
  if (!account) throw Error("Selected account no longer exists.");
  const selected = choices.filter((c) => c.selected && c.kind !== "skip");
  if (!selected.length) throw Error("Select at least one reviewed row.");
  let next: Ledger = {
    ...state,
    expenses: [...state.expenses],
    entries: [...(state.entries || [])],
    debtEvents: [...(state.debtEvents || [])],
  };
  const batchId = crypto.randomUUID(),
    now = new Date().toISOString();
  let added = 0,
    linked = 0,
    skipped = 0;
  for (const choice of selected) {
    const r = choice.row;
    if (
      r.error ||
      !validDate(r.date) ||
      r.date > localDate() ||
      r.date < account.openingDate ||
      r.currency !== account.currency ||
      r.amountMinor <= 0 ||
      !Number.isSafeInteger(r.amountMinor) ||
      !r.key
    )
      throw Error(`Row ${r.line} is invalid. Nothing was imported.`);
    if (alreadyImported(next, r.key) || choice.duplicateDecision === "skip") {
      skipped++;
      continue;
    }
    const matches = possibleMatches(next, r, account.id);
    const latestMatches = possibleMatches(state, r, account.id);
    if (
      latestMatches.some(
        (m) => !choice.matchSnapshot.includes(`${m.target}:${m.id}`),
      )
    )
      throw Error(
        `New possible matches appeared on row ${r.line}. Preview again before importing.`,
      );
    if (choice.duplicateDecision === "pending")
      throw Error(`Resolve possible duplicates on row ${r.line}.`);
    if (choice.duplicateDecision === "link") {
      const match = matches.find(
        (m) => `${m.target}:${m.id}` === choice.matchId,
      );
      if (!match)
        throw Error(
          `The matching record on row ${r.line} changed. Review again.`,
        );
      const append = <T extends { id: string; importKeys?: string[] }>(
        records: T[],
      ) =>
        records.map((x) =>
          x.id === match.id
            ? { ...x, importKeys: [...(x.importKeys || []), r.key] }
            : x,
        );
      if (match.target === "expense")
        next.expenses = append(next.expenses).map((e) =>
          e.id === match.id && !e.accountId
            ? {
                ...e,
                accountId: account.id,
                paymentMethod: accountMethod(next, account.id),
              }
            : e,
        );
      if (match.target === "entry") next.entries = append(next.entries || []);
      if (match.target === "debt")
        next.debtEvents = append(next.debtEvents || []);
      linked++;
      continue;
    }
    if (choice.kind === "review")
      throw Error(
        `Choose what the incoming payment on row ${r.line} represents.`,
      );
    const common = {
      id: crypto.randomUUID(),
      currency: account.currency,
      date: r.date,
      note: r.description.slice(0, 120) || "Imported transaction",
      createdAt: now,
      updatedAt: now,
      userId: null,
      importKeys: [r.key],
      importBatchId: batchId,
    };
    if (choice.kind === "expense") {
      if (r.direction !== "out" || !categories.includes(choice.category))
        throw Error(`Choose a valid outgoing expense on row ${r.line}.`);
      const e: Expense = {
        ...common,
        amountMinor: r.amountMinor,
        category: choice.category,
        paymentMethod: accountMethod(next, account.id),
        accountId: account.id,
        kind: "expense",
      };
      next.expenses.push(e);
    } else if (choice.kind === "card") {
      const card = next.cards.find(
        (c) => c.id === choice.cardId && c.currency === account.currency,
      );
      if (
        r.direction !== "out" ||
        account.kind !== "Bank" ||
        !card ||
        r.amountMinor >
          Math.max(
            0,
            cardBalance(
              card,
              next.expenses.filter((e) => e.date <= r.date),
            ),
          )
      )
        throw Error(
          `Select a card and repayment within its tracked balance on row ${r.line}.`,
        );
      const e: Expense = {
        ...common,
        amountMinor: r.amountMinor,
        category: "Other",
        subcategory: "Credit card repayment",
        paymentMethod: "Bank",
        accountId: account.id,
        cardId: card.id,
        kind: "transfer",
      };
      next.expenses.push(e);
    } else if (choice.kind === "income") {
      if (r.direction !== "in")
        throw Error(`Income must be incoming on row ${r.line}.`);
      const e: MoneyEntry = {
        ...common,
        amountMinor: r.amountMinor,
        toAccountId: account.id,
        kind: "income",
      };
      next.entries!.push(e);
    } else if (choice.kind === "transfer") {
      const other = next.accounts?.find(
        (a) =>
          a.id === choice.otherAccountId &&
          a.currency === account.currency &&
          a.id !== account.id &&
          a.openingDate <= r.date,
      );
      if (!other)
        throw Error(
          `Select a different account of the same currency with a valid opening date on row ${r.line}.`,
        );
      const e: MoneyEntry = {
        ...common,
        amountMinor: r.amountMinor,
        kind: "transfer",
        fromAccountId: r.direction === "out" ? account.id : other.id,
        toAccountId: r.direction === "out" ? other.id : account.id,
      };
      next.entries!.push(e);
    } else if (choice.kind === "debt") {
      const debt = next.debts?.find(
        (d) => d.id === choice.debtId && d.currency === account.currency,
      );
      if (
        !debt ||
        eventDirection(debt, { kind: choice.debtKind }) !== r.direction ||
        !Number.isSafeInteger(choice.interestMinor) ||
        choice.interestMinor < 0 ||
        choice.interestMinor > r.amountMinor
      )
        throw Error(
          `Choose the correct Udharo direction and interest on row ${r.line}.`,
        );
      const event: DebtEvent = {
        ...common,
        debtId: debt.id,
        kind: choice.debtKind,
        principalMinor: r.amountMinor - choice.interestMinor,
        interestMinor: choice.interestMinor,
        accountId: account.id,
      };
      next = addDebtEvent(next, event);
    } else throw Error(`Choose a supported transaction type on row ${r.line}.`);
    added++;
  }
  if (!added && !linked)
    throw Error("All selected rows have already been imported or skipped.");
  next.imports = [
    ...(state.imports || []),
    {
      id: batchId,
      name: name.slice(0, 200),
      accountId: account.id,
      currency: account.currency,
      createdAt: now,
      rowCount: added + linked,
    },
  ];
  return { state: next, added, linked, skipped };
}
