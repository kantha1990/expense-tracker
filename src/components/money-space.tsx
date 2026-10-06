"use client";
import { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowRightLeft,
  Landmark,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import {
  Currency,
  Ledger,
  localDate,
  money,
  parseAmount,
} from "@/lib/expenses";
import {
  accountBalance,
  accountKinds,
  emptyLedger,
  MoneyAccount,
  MoneyEntry,
} from "@/lib/finance";
import { displayDate } from "@/lib/calendar";
import { readLedger, writeLedger } from "@/lib/storage";
import DateField from "./date-field";
export default function MoneySpace({
  currency,
  revision,
  onChange,
}: {
  currency: Currency;
  revision: number;
  onChange: (message: string) => void;
}) {
  const [ledger, setLedger] = useState<Ledger>(emptyLedger()),
    [error, setError] = useState(""),
    [name, setName] = useState(""),
    [kind, setKind] = useState<MoneyAccount["kind"]>("Cash"),
    [opening, setOpening] = useState("0"),
    [openingDate, setOpeningDate] = useState(localDate());
  const [entryKind, setEntryKind] = useState<MoneyEntry["kind"]>("income"),
    [amount, setAmount] = useState(""),
    [to, setTo] = useState(""),
    [from, setFrom] = useState(""),
    [note, setNote] = useState(""),
    [date, setDate] = useState(localDate()),
    [editing, setEditing] = useState<MoneyEntry | null>(null);
  useEffect(() => {
    try {
      setLedger(readLedger());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [revision]);
  useEffect(() => {
    setEditing(null);
    setAmount("");
    setTo("");
    setFrom("");
    setNote("");
  }, [currency]);
  const accounts = (ledger.accounts || []).filter(
      (a) => a.currency === currency,
    ),
    entries = (ledger.entries || [])
      .filter((e) => e.currency === currency)
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          b.createdAt.localeCompare(a.createdAt),
      );
  function change(fn: (state: Ledger) => Ledger, message: string) {
    try {
      const next = fn(readLedger());
      writeLedger(next);
      setLedger(next);
      setError("");
      onChange(message);
      return true;
    } catch (e) {
      setError(
        (e as Error).message || "Unable to save. Device storage may be full.",
      );
      return false;
    }
  }
  function addAccount(e: React.FormEvent) {
    e.preventDefault();
    try {
      const account: MoneyAccount = {
        id: crypto.randomUUID(),
        name: name.trim(),
        kind,
        currency,
        openingMinor: /^0(?:\.0{1,2})?$/.test(opening)
          ? 0
          : parseAmount(opening),
        openingDate,
      };
      if (!account.name) throw Error("Enter an account name.");
      if (openingDate > localDate())
        throw Error("Opening date cannot be in the future.");
      if (
        change(
          (s) => ({ ...s, accounts: [...(s.accounts || []), account] }),
          "Account added.",
        )
      ) {
        setName("");
        setOpening("0");
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function saveEntry(e: React.FormEvent) {
    e.preventDefault();
    try {
      const amountMinor = parseAmount(amount);
      if (date > localDate()) throw Error("Choose today or a past date.");
      if (
        change(
          (s) => {
            if (
              editing &&
              !(s.entries || []).some(
                (x) => x.id === editing.id && x.updatedAt === editing.updatedAt,
              )
            )
              throw Error(
                "This entry changed in another tab. Reopen it before editing.",
              );
            const now = new Date().toISOString();
            const entry: MoneyEntry = {
              id: editing?.id || crypto.randomUUID(),
              kind: entryKind,
              amountMinor,
              currency,
              toAccountId: to,
              ...(entryKind === "transfer" ? { fromAccountId: from } : {}),
              note: note.trim(),
              date,
              createdAt: editing?.createdAt || now,
              updatedAt: now,
              userId: null,
              ...(editing?.importKeys
                ? {
                    importKeys: editing.importKeys,
                    importBatchId: editing.importBatchId,
                  }
                : {}),
            };
            return {
              ...s,
              entries: editing
                ? (s.entries || []).map((x) =>
                    x.id === editing.id ? entry : x,
                  )
                : [...(s.entries || []), entry],
            };
          },
          editing
            ? "Money entry updated."
            : entryKind === "income"
              ? "Income recorded."
              : "Transfer recorded. Spending totals are unchanged.",
        )
      ) {
        setEditing(null);
        setAmount("");
        setNote("");
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="money-space">
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <div className="section-title">
        <h2>
          <Wallet size={18} /> Accounts & wallets
        </h2>
        <span>{currency}</span>
      </div>
      <p className="section-help">
        Record opening balances, then link new expenses to their accounts.
        Balances include transactions from each account’s opening date onward.
        These are manual records, not live bank balances.
      </p>
      <div className="account-grid">
        {accounts.map((a) => {
          const balance = accountBalance(a, ledger, localDate());
          return (
            <div className="account-card" key={a.id}>
              <div>
                <span>
                  {a.kind === "Bank" ? (
                    <Landmark size={18} />
                  ) : (
                    <Wallet size={18} />
                  )}{" "}
                  {a.kind}
                </span>
                <button
                  aria-label={`Delete ${a.name} account`}
                  onClick={() => {
                    if (
                      confirm(
                        "Delete this account? Accounts linked to history or schedules cannot be deleted.",
                      )
                    )
                      change((s) => {
                        if (
                          s.expenses.some((e) => e.accountId === a.id) ||
                          (s.entries || []).some(
                            (e) =>
                              e.toAccountId === a.id ||
                              e.fromAccountId === a.id,
                          ) ||
                          s.recurring.some((r) => r.accountId === a.id) ||
                          (s.debtEvents || []).some(
                            (e) => e.accountId === a.id,
                          ) ||
                          (s.imports || []).some((b) => b.accountId === a.id)
                        )
                          throw Error(
                            "This account is linked to history or schedules.",
                          );
                        return {
                          ...s,
                          accounts: s.accounts?.filter((x) => x.id !== a.id),
                        };
                      }, "Account removed.");
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <h3>{a.name}</h3>
              <strong className={balance < 0 ? "negative" : ""}>
                {money(balance, currency)}
              </strong>
              <p>
                Opening: {money(a.openingMinor, currency)} ·{" "}
                {displayDate(a.openingDate, ledger.dateDisplay)}
              </p>
            </div>
          );
        })}
      </div>
      {accounts.length === 0 && (
        <p className="muted">
          Start with your cash, bank, eSewa or Khalti balance.
        </p>
      )}
      <details className="finance-box">
        <summary>
          <Plus size={15} /> Add account or wallet
        </summary>
        <form className="finance-form" onSubmit={addAccount}>
          <div className="form-row">
            <label>
              Account name
              <input
                required
                maxLength={60}
                placeholder="e.g. My eSewa"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Account type
              <select
                aria-label="Account type"
                value={kind}
                onChange={(e) =>
                  setKind(e.target.value as MoneyAccount["kind"])
                }
              >
                {accountKinds.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>
              Opening balance ({currency})
              <input
                aria-label="Opening account balance"
                required
                inputMode="decimal"
                value={opening}
                onChange={(e) => setOpening(e.target.value)}
              />
            </label>
            <DateField
              label="Opening date"
              value={openingDate}
              onChange={setOpeningDate}
              mode={ledger.dateDisplay}
              max={localDate()}
            />
          </div>
          <p className="muted">
            Use your balance at the start of this date, before transactions you
            will link. Older expenses remain unlinked until you edit them.
          </p>
          <button className="primary">Save account</button>
        </form>
      </details>
      {accounts.length > 0 && (
        <div className="finance-box entry-form-box">
          <h3>{editing ? "Edit money entry" : "Income & transfers"}</h3>
          <form className="finance-form" onSubmit={saveEntry}>
            <div className="payment-picker">
              <button
                type="button"
                aria-pressed={entryKind === "income"}
                className={entryKind === "income" ? "chosen" : ""}
                onClick={() => setEntryKind("income")}
              >
                <ArrowDownLeft size={16} /> Income
              </button>
              <button
                type="button"
                aria-pressed={entryKind === "transfer"}
                className={entryKind === "transfer" ? "chosen" : ""}
                onClick={() => setEntryKind("transfer")}
              >
                <ArrowRightLeft size={16} /> Transfer
              </button>
            </div>
            <div className="form-row">
              <label>
                Amount ({currency})
                <input
                  aria-label="Money entry amount"
                  required
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <DateField
                value={date}
                onChange={setDate}
                mode={ledger.dateDisplay}
                max={localDate()}
              />
            </div>
            <div className="form-row">
              {entryKind === "transfer" && (
                <label>
                  From account
                  <select
                    aria-label="From account"
                    required
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  >
                    <option value="">Select account</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                {entryKind === "transfer" ? "To account" : "Received into"}
                <select
                  aria-label={
                    entryKind === "transfer" ? "To account" : "Received into"
                  }
                  required
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                >
                  <option value="">Select account</option>
                  {accounts
                    .filter((a) => entryKind !== "transfer" || a.id !== from)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <label>
              Note
              <input
                maxLength={120}
                placeholder="Salary, remittance or wallet top-up"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <p className="muted">
              Transfers move money between your accounts and never count as
              spending or income. Record any transfer fee separately as an
              expense.
            </p>
            <button className="primary">
              {editing ? "Save money entry changes" : "Record money entry"}
            </button>
            {editing && (
              <button
                className="outline"
                type="button"
                onClick={() => {
                  setEditing(null);
                  setAmount("");
                  setNote("");
                }}
              >
                Cancel edit
              </button>
            )}
          </form>
        </div>
      )}
      <div className="section-title">
        <h2>Income & transfer history</h2>
        <span>{entries.length} records</span>
      </div>
      <div className="transaction-list">
        {entries.length === 0 ? (
          <p className="muted">No income or account transfers yet.</p>
        ) : (
          entries.map((e) => (
            <div className="transaction" key={e.id}>
              <span className="category-icon household">
                {e.kind === "income" ? (
                  <ArrowDownLeft size={18} />
                ) : (
                  <ArrowRightLeft size={18} />
                )}
              </span>
              <div className="transaction-info">
                <strong>
                  {e.note || (e.kind === "income" ? "Income" : "Transfer")}
                </strong>
                <span>
                  {e.fromAccountId
                    ? `${accounts.find((a) => a.id === e.fromAccountId)?.name} → `
                    : ""}
                  {accounts.find((a) => a.id === e.toAccountId)?.name} ·{" "}
                  {displayDate(e.date, ledger.dateDisplay)}
                </span>
              </div>
              <strong className="transaction-amount">
                {e.kind === "income" ? "+" : "↔"}
                {money(e.amountMinor, currency)}
              </strong>
              <button
                className="edit-expense"
                aria-label={`Edit ${e.note || e.kind} money entry`}
                onClick={() => {
                  if (e.debtEventId) {
                    setError(
                      "Correct this interest through the linked Udharo movement.",
                    );
                    return;
                  }
                  setEditing(e);
                  setEntryKind(e.kind);
                  setAmount((e.amountMinor / 100).toFixed(2));
                  setTo(e.toAccountId);
                  setFrom(e.fromAccountId || "");
                  setNote(e.note);
                  setDate(e.date);
                  document
                    .querySelector(".entry-form-box")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                Edit
              </button>
              <button
                className="delete"
                aria-label={`Delete ${e.note || e.kind} money entry`}
                onClick={() => {
                  if (e.debtEventId) {
                    setError(
                      "Remove this interest through the linked Udharo movement.",
                    );
                    return;
                  }
                  if (
                    confirm(
                      "Delete this money entry? Account balances will change.",
                    )
                  )
                    change(
                      (s) => ({
                        ...s,
                        entries: s.entries?.filter((x) => x.id !== e.id),
                      }),
                      "Money entry deleted.",
                    );
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
