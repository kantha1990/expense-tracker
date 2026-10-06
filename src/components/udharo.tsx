"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Handshake,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  Currency,
  Ledger,
  localDate,
  money,
  parseAmount,
} from "@/lib/expenses";
import { emptyLedger } from "@/lib/finance";
import {
  addDebtEvent,
  Debt,
  DebtEvent,
  debtBalance,
  eventDirection,
  removeDebtEvent,
} from "@/lib/debts";
import { displayDate } from "@/lib/calendar";
import { readLedger, writeLedger } from "@/lib/storage";
import DateField from "./date-field";
export default function Udharo({
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
    [person, setPerson] = useState(""),
    [direction, setDirection] = useState<Debt["direction"]>("lent"),
    [mode, setMode] = useState("existing"),
    [amount, setAmount] = useState(""),
    [date, setDate] = useState(localDate()),
    [due, setDue] = useState(""),
    [account, setAccount] = useState(""),
    [note, setNote] = useState("");
  const [selected, setSelected] = useState(""),
    [eventKind, setEventKind] = useState<DebtEvent["kind"]>("repayment"),
    [eventAmount, setEventAmount] = useState(""),
    [interest, setInterest] = useState("0"),
    [eventDate, setEventDate] = useState(localDate()),
    [eventAccount, setEventAccount] = useState(""),
    [eventNote, setEventNote] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    try {
      setLedger(readLedger());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [revision]);
  useEffect(() => {
    setAccount("");
    setSelected("");
    setEventAccount("");
    dialog.current?.close();
  }, [currency]);
  const debts = (ledger.debts || [])
    .filter((d) => d.currency === currency)
    .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  const accounts = (ledger.accounts || []).filter(
      (a) => a.currency === currency,
    ),
    lent = debts
      .filter((d) => d.direction === "lent")
      .reduce((s, d) => s + debtBalance(d, ledger, localDate()), 0),
    borrowed = debts
      .filter((d) => d.direction === "borrowed")
      .reduce((s, d) => s + debtBalance(d, ledger, localDate()), 0);
  function change(fn: (s: Ledger) => Ledger, message: string) {
    try {
      const next = fn(readLedger());
      writeLedger(next);
      setLedger(next);
      setError("");
      onChange(message);
      return true;
    } catch (e) {
      setError((e as Error).message || "Could not save. Check device storage.");
      return false;
    }
  }
  function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      const principal = parseAmount(amount);
      if (date > localDate()) throw Error("Choose today or a past date.");
      if (due && due < date)
        throw Error("Due date must be on or after the debt start date.");
      const now = new Date().toISOString();
      const d: Debt = {
        id: crypto.randomUUID(),
        person: person.trim(),
        direction,
        currency,
        openingMinor: mode === "existing" ? principal : 0,
        date,
        ...(due ? { dueDate: due } : {}),
        note: note.trim(),
        createdAt: now,
        updatedAt: now,
        userId: null,
      };
      if (!d.person) throw Error("Enter the person’s name.");
      if (
        change(
          (s) => {
            let next: Ledger = { ...s, debts: [...(s.debts || []), d] };
            if (mode === "new")
              next = addDebtEvent(next, {
                id: crypto.randomUUID(),
                debtId: d.id,
                kind: "advance",
                principalMinor: principal,
                interestMinor: 0,
                accountId: account,
                date,
                note: d.note,
                createdAt: now,
                updatedAt: now,
                userId: null,
              });
            return next;
          },
          mode === "new"
            ? "Udharo and money movement recorded."
            : "Existing outstanding Udharo added. Account balances are unchanged.",
        )
      ) {
        setPerson("");
        setAmount("");
        setNote("");
        setDue("");
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function open(id: string) {
    setSelected(id);
    setEventKind("repayment");
    setEventAmount("");
    setInterest("0");
    setEventDate(localDate());
    setEventAccount("");
    setEventNote("");
    setError("");
    dialog.current?.showModal();
  }
  function saveEvent(e: React.FormEvent) {
    e.preventDefault();
    try {
      const total = parseAmount(eventAmount),
        fee =
          eventKind === "repayment" && !/^0(?:\.0{1,2})?$/.test(interest)
            ? parseAmount(interest)
            : 0;
      if (fee > total) throw Error("Interest cannot exceed the total payment.");
      const now = new Date().toISOString();
      const event: DebtEvent = {
        id: crypto.randomUUID(),
        debtId: selected,
        kind: eventKind,
        principalMinor: total - fee,
        interestMinor: fee,
        accountId: eventAccount,
        date: eventDate,
        note: eventNote.trim(),
        createdAt: now,
        updatedAt: now,
        userId: null,
      };
      if (
        change(
          (s) => addDebtEvent(s, event),
          "Udharo movement recorded. Principal and interest are tracked separately.",
        )
      )
        dialog.current?.close();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const active = ledger.debts?.find((d) => d.id === selected);
  return (
    <section className="udharo">
      <div className="section-title">
        <h2>
          <Handshake size={19} />
          Udharo · उधारो
        </h2>
        <span>{currency}</span>
      </div>
      <p className="section-help">
        Money lent and borrowed, with partial repayments. Principal changes cash
        and debt—not ordinary spending or income. Interest is recorded
        separately.
      </p>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <div className="debt-totals">
        <div>
          <ArrowDownLeft size={18} />
          <span>Others owe you</span>
          <strong>{money(lent, currency)}</strong>
        </div>
        <div>
          <ArrowUpRight size={18} />
          <span>You owe others</span>
          <strong>{money(borrowed, currency)}</strong>
        </div>
      </div>
      <details className="finance-box">
        <summary>
          <Plus size={15} /> Add Udharo
        </summary>
        <form className="finance-form" onSubmit={add}>
          <div className="form-row">
            <label>
              Person
              <input
                required
                maxLength={120}
                placeholder="Who is it with?"
                value={person}
                onChange={(e) => setPerson(e.target.value)}
              />
            </label>
            <label>
              Direction
              <select
                aria-label="Udharo direction"
                value={direction}
                onChange={(e) =>
                  setDirection(e.target.value as Debt["direction"])
                }
              >
                <option value="lent">I lent money — they owe me</option>
                <option value="borrowed">I borrowed — I owe them</option>
              </select>
            </label>
          </div>
          <label>
            Record type
            <select
              aria-label="Udharo record type"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="existing">
                Existing outstanding — no money moves now
              </option>
              <option value="new">New loan — record money moving now</option>
            </select>
          </label>
          <div className="form-row">
            <label>
              Principal amount ({currency})
              <input
                aria-label="Udharo principal amount"
                required
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <DateField
              label="Debt start date"
              value={date}
              onChange={setDate}
              mode={ledger.dateDisplay}
              max={localDate()}
            />
          </div>
          {mode === "new" && (
            <label>
              Money account
              <select
                aria-label="Udharo opening account"
                required
                value={account}
                onChange={(e) => setAccount(e.target.value)}
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
            Expected repayment date (AD, optional)
            <input
              aria-label="Udharo due date"
              type="date"
              value={due}
              min={date}
              onChange={(e) => setDue(e.target.value)}
            />
            <span>
              A borrowed balance due before your budget period ends is reserved
              in your available estimate.
            </span>
          </label>
          <label>
            Note
            <input
              maxLength={120}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional agreement or purpose"
            />
          </label>
          <p className="muted">
            Existing outstanding does not alter cash. For a new loan, use an
            account balance from before the money moved. No automatic payments
            or messages.
          </p>
          <button className="primary">Save Udharo</button>
        </form>
      </details>
      {debts.length === 0 && (
        <p className="muted">
          Add money lent to a friend or an amount you borrowed.
        </p>
      )}
      <div className="debt-grid">
        {debts.map((d) => {
          const remaining = debtBalance(d, ledger, localDate()),
            events = (ledger.debtEvents || [])
              .filter((e) => e.debtId === d.id)
              .sort(
                (a, b) =>
                  b.date.localeCompare(a.date) ||
                  b.createdAt.localeCompare(a.createdAt),
              );
          return (
            <div className="finance-box debt-card" key={d.id}>
              <div className="debt-card-heading">
                <div>
                  <span className="eyebrow">
                    {d.direction === "lent" ? "THEY OWE YOU" : "YOU OWE THEM"}
                  </span>
                  <h3>{d.person}</h3>
                </div>
                <span className={remaining === 0 ? "settled" : "debt-status"}>
                  {remaining === 0
                    ? "Settled"
                    : d.dueDate && d.dueDate < localDate()
                      ? "Overdue"
                      : "Outstanding"}
                </span>
              </div>
              <strong className="debt-balance">
                {money(remaining, currency)}
              </strong>
              <p className="muted">
                Started {displayDate(d.date, ledger.dateDisplay)}
                {d.dueDate
                  ? ` · Due ${displayDate(d.dueDate, ledger.dateDisplay)}`
                  : " · No due date"}
                {d.note ? ` · ${d.note}` : ""}
              </p>
              <div className="debt-actions">
                <button className="outline" onClick={() => open(d.id)}>
                  Record repayment / more money
                </button>
                <button
                  className="text-button"
                  aria-label={`Delete ${d.person} Udharo`}
                  onClick={() => {
                    if (
                      confirm(
                        "Delete this Udharo? Records with money movements must have those movements removed first.",
                      )
                    )
                      change((s) => {
                        if (s.debtEvents?.some((e) => e.debtId === d.id))
                          throw Error("Remove this Udharo’s movements first.");
                        return {
                          ...s,
                          debts: s.debts?.filter((x) => x.id !== d.id),
                        };
                      }, "Udharo removed.");
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <details className="debt-history">
                <summary>Edit details</summary>
                <form
                  className="finance-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fields = new FormData(e.currentTarget);
                    change(
                      (s) => ({
                        ...s,
                        debts: s.debts?.map((x) =>
                          x.id === d.id
                            ? {
                                ...x,
                                person: String(
                                  fields.get("person") || "",
                                ).trim(),
                                note: String(fields.get("note") || "").trim(),
                                dueDate:
                                  String(fields.get("due") || "") || undefined,
                                updatedAt: new Date().toISOString(),
                              }
                            : x,
                        ),
                      }),
                      "Udharo details updated.",
                    );
                  }}
                >
                  <label>
                    Person
                    <input
                      name="person"
                      required
                      maxLength={120}
                      defaultValue={d.person}
                    />
                  </label>
                  <label>
                    Expected repayment date (AD)
                    <input
                      type="date"
                      name="due"
                      min={d.date}
                      defaultValue={d.dueDate || ""}
                    />
                  </label>
                  <label>
                    Note
                    <input name="note" maxLength={120} defaultValue={d.note} />
                  </label>
                  <button className="primary">Update Udharo details</button>
                </form>
              </details>
              <details className="debt-history">
                <summary>Movement history ({events.length})</summary>
                {d.openingMinor > 0 && (
                  <p className="muted">
                    Opening outstanding {money(d.openingMinor, currency)} · no
                    cash movement
                  </p>
                )}
                {events.map((e) => (
                  <div className="debt-movement" key={e.id}>
                    <div>
                      <strong>
                        {e.kind === "advance" ? "More money" : "Repayment"} ·{" "}
                        {eventDirection(d, e) === "in" ? "Received" : "Paid"}{" "}
                        {money(e.principalMinor + e.interestMinor, currency)}
                      </strong>
                      <span>
                        Principal {money(e.principalMinor, currency)}
                        {e.interestMinor
                          ? ` · Interest ${money(e.interestMinor, currency)}`
                          : ""}
                      </span>
                      <span>
                        {displayDate(e.date, ledger.dateDisplay)} ·{" "}
                        {accounts.find((a) => a.id === e.accountId)?.name}
                        {e.note ? ` · ${e.note}` : ""}
                      </span>
                    </div>
                    <button
                      className="delete"
                      aria-label={`Delete ${d.person} ${e.kind} ${e.date}`}
                      onClick={() => {
                        if (
                          confirm(
                            "Remove this movement and its linked interest? Balances will change.",
                          )
                        )
                          change(
                            (s) => removeDebtEvent(s, e.id),
                            "Udharo movement and linked interest removed.",
                          );
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </details>
            </div>
          );
        })}
      </div>
      <dialog ref={dialog} aria-labelledby="udharo-event-title">
        <form onSubmit={saveEvent}>
          <div className="modal-header">
            <div>
              <div className="eyebrow">{active?.person}</div>
              <h2 id="udharo-event-title">Record Udharo movement</h2>
            </div>
            <button
              type="button"
              className="close"
              aria-label="Close Udharo movement"
              onClick={() => dialog.current?.close()}
            >
              <X />
            </button>
          </div>
          <label className="extra-label">
            Movement
            <select
              aria-label="Udharo movement type"
              value={eventKind}
              onChange={(e) =>
                setEventKind(e.target.value as DebtEvent["kind"])
              }
            >
              <option value="repayment">Repayment</option>
              <option value="advance">More money lent / borrowed</option>
            </select>
          </label>
          <div className="form-row">
            <label>
              Total{" "}
              {active && eventDirection(active, { kind: eventKind }) === "in"
                ? "received"
                : "paid"}{" "}
              ({currency})
              <input
                aria-label="Udharo movement amount"
                required
                inputMode="decimal"
                value={eventAmount}
                onChange={(e) => setEventAmount(e.target.value)}
              />
            </label>
            <DateField
              label="Movement date"
              value={eventDate}
              onChange={setEventDate}
              mode={ledger.dateDisplay}
              max={localDate()}
            />
          </div>
          {eventKind === "repayment" && (
            <label className="extra-label">
              Interest included ({currency})
              <input
                aria-label="Udharo interest amount"
                required
                inputMode="decimal"
                value={interest}
                onChange={(e) => setInterest(e.target.value)}
              />
              <span>
                Principal repayment = total minus interest. Enter the agreed
                split.
              </span>
            </label>
          )}
          <label className="extra-label">
            Money account
            <select
              aria-label="Udharo movement account"
              required
              value={eventAccount}
              onChange={(e) => setEventAccount(e.target.value)}
            >
              <option value="">Select account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="extra-label">
            Note
            <input
              maxLength={120}
              value={eventNote}
              onChange={(e) => setEventNote(e.target.value)}
            />
          </label>
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
          <button className="primary save">Save Udharo movement</button>
        </form>
      </dialog>
    </section>
  );
}
