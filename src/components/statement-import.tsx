"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Download, FileUp, Upload } from "lucide-react";
import {
  categories,
  Currency,
  Ledger,
  localDate,
  money,
  parseAmount,
} from "@/lib/expenses";
import { emptyLedger } from "@/lib/finance";
import {
  alreadyImported,
  applyStatement,
  defaultChoices,
  detectDelimiter,
  guessMapping,
  ImportChoice,
  ImportMapping,
  normalizeStatement,
  parseCSV,
  possibleMatches,
} from "@/lib/imports";
import { readLedger, writeLedger } from "@/lib/storage";
export default function StatementImport({
  currency,
  revision,
  onChange,
}: {
  currency: Currency;
  revision: number;
  onChange: (message: string) => void;
}) {
  const [ledger, setLedger] = useState<Ledger>(emptyLedger()),
    [raw, setRaw] = useState(""),
    [fileName, setFileName] = useState("Pasted statement"),
    [accountId, setAccountId] = useState(""),
    [mapping, setMapping] = useState<ImportMapping>(guessMapping([])),
    [choices, setChoices] = useState<ImportChoice[]>([]),
    [error, setError] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(0);
  const file = useRef<HTMLInputElement>(null),
    sequence = useRef(0);
  useEffect(() => {
    try {
      setLedger(readLedger());
    } catch (e) {
      setError((e as Error).message);
    }
  }, [revision]);
  useEffect(() => {
    sequence.current++;
    setAccountId("");
    setChoices([]);
    setReviewed(false);
    setBusy(false);
  }, [currency]);
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );
  const accounts = (ledger.accounts || []).filter(
      (a) => a.currency === currency,
    ),
    account = accounts.find((a) => a.id === accountId);
  let headers: string[] = [];
  try {
    headers = parseCSV(raw, mapping.delimiter)[mapping.headerRow] || [];
  } catch {}
  function reset() {
    sequence.current++;
    setChoices([]);
    setReviewed(false);
    setPage(0);
    setBusy(false);
  }
  function loadText(value: string, name: string) {
    reset();
    setError("");
    setRaw(value);
    setFileName(name);
    try {
      const delimiter = detectDelimiter(value),
        rows = parseCSV(value, delimiter);
      setMapping(guessMapping(rows[0] || [], delimiter));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function load(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    reset();
    if (!/\.(csv|tsv|txt)$/i.test(f.name) || f.size > 2 * 1024 * 1024) {
      setError(
        "Choose a UTF-8 CSV/TSV file smaller than 2 MB. PDF and Excel files need a CSV export first.",
      );
      return;
    }
    const generation = ++sequence.current;
    setBusy(true);
    try {
      const text = await f.text();
      if (generation !== sequence.current) return;
      if (text.includes("\uFFFD"))
        throw Error("Export this file with UTF-8 encoding.");
      loadText(text, f.name);
    } catch (e) {
      if (generation === sequence.current) {
        setBusy(false);
        setError((e as Error).message);
      }
    }
  }
  function configure(patch: Partial<ImportMapping>) {
    reset();
    setMapping({ ...mapping, ...patch });
    setError("");
  }
  async function preview() {
    if (!account) {
      setError(
        "Choose the account this statement belongs to. Add an account first if needed.",
      );
      return;
    }
    const generation = ++sequence.current;
    setBusy(true);
    setError("");
    setReviewed(false);
    try {
      const fresh = readLedger(),
        selected = fresh.accounts?.find((a) => a.id === accountId);
      if (!selected) throw Error("Selected account no longer exists.");
      const rows = await normalizeStatement(raw, mapping, selected);
      if (generation !== sequence.current) return;
      setLedger(fresh);
      setChoices(defaultChoices(fresh, rows, accountId));
      setPage(0);
    } catch (e) {
      if (generation === sequence.current) {
        setChoices([]);
        setError((e as Error).message);
      }
    } finally {
      if (generation === sequence.current) setBusy(false);
    }
  }
  function update(id: string, patch: Partial<ImportChoice>) {
    setReviewed(false);
    setChoices((old) =>
      old.map((c) => (c.row.id === id ? { ...c, ...patch } : c)),
    );
  }
  function importRows() {
    if (!reviewed) return;
    try {
      const fresh = readLedger(),
        result = applyStatement(fresh, accountId, choices, fileName);
      writeLedger(result.state);
      setLedger(result.state);
      setChoices(
        defaultChoices(
          result.state,
          choices.map((c) => c.row),
          accountId,
        ),
      );
      setReviewed(false);
      setError("");
      onChange(
        `Statement saved: ${result.added} new, ${result.linked} linked to existing, ${result.skipped} skipped.`,
      );
    } catch (e) {
      setError((e as Error).message || "Could not save. Nothing was imported.");
    }
  }
  function template() {
    const url = URL.createObjectURL(
      new Blob(["Date,Description,Debit,Credit,Reference,Currency\r\n"], {
        type: "text/csv",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "kharcha-statement-template.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const selected = choices.filter((c) => c.selected && c.kind !== "skip"),
    invalid = choices.filter((c) => c.row.error).length,
    known = choices.filter((c) => alreadyImported(ledger, c.row.key)).length,
    reviewNeeded = selected.filter(
      (c) =>
        c.duplicateDecision === "pending" ||
        (c.duplicateDecision !== "link" && c.kind === "review"),
    ).length;
  const pageSize = 20,
    maxPage = Math.max(0, Math.ceil(choices.length / pageSize) - 1),
    visible = choices.slice(page * pageSize, (page + 1) * pageSize);
  return (
    <section className="statement-import">
      <div className="section-title">
        <h2>
          <FileUp size={18} />
          Import a statement
        </h2>
        <span>CSV / pasted rows</span>
      </div>
      <p className="section-help">
        Import bank or wallet transactions from a UTF-8 CSV/TSV file. Map your
        columns and review each payment type. Files are processed on this
        device; no bank login is used. Provider-specific PDF, Excel and
        screenshot imports are not included yet.
      </p>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <div className="finance-box">
        <div className="import-file-actions">
          <button className="outline" onClick={() => file.current?.click()}>
            <Upload size={15} />
            Choose statement
          </button>
          <button className="outline" onClick={template}>
            <Download size={15} />
            CSV template
          </button>
          <input
            type="file"
            ref={file}
            hidden
            aria-label="Statement CSV file"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
            onChange={load}
          />
        </div>
        <label className="extra-label">
          Statement account
          <select
            aria-label="Statement account"
            value={accountId}
            onChange={(e) => {
              reset();
              setAccountId(e.target.value);
            }}
          >
            <option value="">Select account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.kind}
              </option>
            ))}
          </select>
          <span>
            Use a balance from the start of the earliest imported date. Rows
            before this account’s opening date are rejected.
          </span>
        </label>
        {accounts.length === 0 && (
          <p className="coverage-warning">
            Add a {currency} account under Accounts first.
          </p>
        )}
        <label className="extra-label">
          Paste CSV or spreadsheet rows
          <textarea
            aria-label="Paste statement rows"
            rows={5}
            value={raw}
            placeholder="Date,Description,Debit,Credit,Reference,Currency"
            onChange={(e) => loadText(e.target.value, "Pasted statement")}
          />
        </label>
        {raw && (
          <>
            <p className="muted">
              {fileName} · {headers.length} columns
            </p>
            <div className="form-row import-mapping">
              <label>
                Separator
                <select
                  aria-label="Statement separator"
                  value={mapping.delimiter}
                  onChange={(e) =>
                    configure({
                      delimiter: e.target.value as ImportMapping["delimiter"],
                    })
                  }
                >
                  <option value=",">Comma</option>
                  <option value=";">Semicolon</option>
                  <option value={"\t"}>Tab / spreadsheet</option>
                </select>
              </label>
              <label>
                Header row
                <input
                  aria-label="Statement header row"
                  type="number"
                  min="1"
                  max="20"
                  value={mapping.headerRow + 1}
                  onChange={(e) => {
                    reset();
                    const headerRow = Math.max(
                      0,
                      Math.min(19, Number(e.target.value) - 1),
                    );
                    try {
                      const h =
                        parseCSV(raw, mapping.delimiter)[headerRow] || [];
                      setMapping({
                        ...guessMapping(h, mapping.delimiter),
                        headerRow,
                        dateFormat: mapping.dateFormat,
                      });
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                />
              </label>
              <label>
                Date format
                <select
                  aria-label="Statement date format"
                  value={mapping.dateFormat}
                  onChange={(e) =>
                    configure({
                      dateFormat: e.target.value as ImportMapping["dateFormat"],
                    })
                  }
                >
                  <option value="YMD">AD year-month-day</option>
                  <option value="DMY">AD day-month-year</option>
                  <option value="MDY">AD month-day-year</option>
                  <option value="BS">BS year-month-day</option>
                </select>
              </label>
              <label>
                Amount layout
                <select
                  aria-label="Statement amount layout"
                  value={mapping.amountMode}
                  onChange={(e) =>
                    configure({
                      amountMode: e.target.value as ImportMapping["amountMode"],
                    })
                  }
                >
                  <option value="separate">
                    Separate Debit / Credit columns
                  </option>
                  <option value="signed">
                    Signed: negative out / positive in
                  </option>
                  <option value="outgoing">
                    Positive amounts: all outgoing
                  </option>
                </select>
              </label>
              {(
                [
                  "date",
                  "description",
                  ...(mapping.amountMode === "separate"
                    ? ["debit", "credit"]
                    : ["amount"]),
                  "reference",
                  "currency",
                ] as const
              ).map((field) => (
                <label key={field}>
                  {field[0].toUpperCase() + field.slice(1)} column
                  <select
                    aria-label={`Map ${field} column`}
                    value={mapping[field as keyof ImportMapping]}
                    onChange={(e) =>
                      configure({ [field]: Number(e.target.value) })
                    }
                  >
                    <option value="-1">
                      {field === "reference" || field === "currency"
                        ? "Not present"
                        : "Select column"}
                    </option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {i + 1}. {h || "(blank)"}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <button
              className="primary"
              disabled={busy || !accountId}
              onClick={() => void preview()}
            >
              {busy ? "Preparing review…" : "Preview transactions"}
            </button>
          </>
        )}
      </div>
      {choices.length > 0 && (
        <>
          <div className="import-summary">
            <strong>
              {choices.length} rows · {selected.length} selected
            </strong>
            <span>
              {invalid} invalid · {known} already imported · {reviewNeeded}{" "}
              selected need review
            </span>
          </div>
          <p className="section-help">
            A debit is not always spending: choose Transfer for wallet
            loading/withdrawals, or Udharo for principal. A credit needs an
            explicit type. Possible matches are suggestions; link only when it
            is the same transaction.
          </p>
          <div className="import-selection">
            <button
              className="outline"
              onClick={() => {
                setReviewed(false);
                setChoices((old) =>
                  old.map((c) => ({
                    ...c,
                    selected:
                      !c.row.error &&
                      !alreadyImported(ledger, c.row.key) &&
                      (c.kind !== "review" || c.duplicateDecision === "link") &&
                      c.kind !== "skip" &&
                      c.duplicateDecision !== "pending",
                  })),
                );
              }}
            >
              Select classified rows
            </button>
            <button
              className="text-button"
              onClick={() => {
                setReviewed(false);
                setChoices((old) =>
                  old.map((c) => ({ ...c, selected: false })),
                );
              }}
            >
              Clear selection
            </button>
          </div>
          <div className="import-review-list">
            {visible.map((c) => {
              const r = c.row,
                matches = possibleMatches(ledger, r, accountId),
                imported = alreadyImported(ledger, r.key);
              return (
                <article
                  className={`import-row ${r.error ? "invalid-row" : ""}`}
                  key={r.id}
                >
                  <div className="import-row-heading">
                    <label>
                      <input
                        type="checkbox"
                        aria-label={`Select statement row ${r.line}`}
                        checked={c.selected}
                        disabled={!!r.error || imported}
                        onChange={(e) =>
                          update(r.id, { selected: e.target.checked })
                        }
                      />
                      <span>
                        Row {r.line} · {r.date || "Invalid date"} AD
                      </span>
                    </label>
                    <strong>
                      {r.direction === "in" ? "+" : "−"}
                      {money(r.amountMinor, currency)}
                    </strong>
                  </div>
                  <p>{r.description || "(No description)"}</p>
                  {r.reference && (
                    <span className="muted">Reference: {r.reference}</span>
                  )}
                  {r.error ? (
                    <p className="alert">{r.error}</p>
                  ) : imported ? (
                    <p className="import-known">
                      <Check size={14} />
                      Already imported — skipped
                    </p>
                  ) : (
                    <>
                      <div className="form-row">
                        <label>
                          Payment type
                          <select
                            aria-label={`Type for statement row ${r.line}`}
                            value={c.kind}
                            onChange={(e) => {
                              const kind = e.target
                                .value as ImportChoice["kind"];
                              update(r.id, {
                                kind,
                                selected:
                                  kind !== "review" &&
                                  kind !== "skip" &&
                                  c.duplicateDecision !== "pending",
                              });
                            }}
                          >
                            {r.direction === "in" && (
                              <option value="review">
                                Choose incoming payment type
                              </option>
                            )}
                            {r.direction === "out" && (
                              <option value="expense">Expense</option>
                            )}
                            {r.direction === "in" && (
                              <option value="income">Income</option>
                            )}
                            <option value="transfer">
                              Transfer between my accounts
                            </option>
                            <option value="debt">Udharo money movement</option>
                            {r.direction === "out" &&
                              account?.kind === "Bank" && (
                                <option value="card">
                                  Credit card repayment
                                </option>
                              )}
                            <option value="skip">Skip this row</option>
                          </select>
                        </label>
                        {c.kind === "expense" && (
                          <label>
                            Category
                            <select
                              aria-label={`Category for statement row ${r.line}`}
                              value={c.category}
                              onChange={(e) =>
                                update(r.id, {
                                  category: e.target
                                    .value as ImportChoice["category"],
                                })
                              }
                            >
                              {categories.map((k) => (
                                <option key={k}>{k}</option>
                              ))}
                            </select>
                          </label>
                        )}
                        {c.kind === "card" && (
                          <label>
                            Credit card
                            <select
                              aria-label={`Card for statement row ${r.line}`}
                              value={c.cardId}
                              onChange={(e) =>
                                update(r.id, { cardId: e.target.value })
                              }
                            >
                              <option value="">Select card</option>
                              {ledger.cards
                                .filter((card) => card.currency === currency)
                                .map((card) => (
                                  <option key={card.id} value={card.id}>
                                    {card.name}
                                  </option>
                                ))}
                            </select>
                          </label>
                        )}
                        {c.kind === "transfer" && (
                          <label>
                            Other account
                            <select
                              aria-label={`Other account for statement row ${r.line}`}
                              value={c.otherAccountId}
                              onChange={(e) =>
                                update(r.id, { otherAccountId: e.target.value })
                              }
                            >
                              <option value="">Select other account</option>
                              {accounts
                                .filter((a) => a.id !== accountId)
                                .map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.name}
                                  </option>
                                ))}
                            </select>
                          </label>
                        )}
                      </div>
                      {c.kind === "debt" && (
                        <div className="form-row">
                          <label>
                            Udharo
                            <select
                              aria-label={`Udharo for statement row ${r.line}`}
                              value={c.debtId}
                              onChange={(e) =>
                                update(r.id, { debtId: e.target.value })
                              }
                            >
                              <option value="">Select Udharo</option>
                              {ledger.debts
                                ?.filter((d) => d.currency === currency)
                                .map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.person} · {d.direction}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <label>
                            Movement
                            <select
                              aria-label={`Udharo movement for statement row ${r.line}`}
                              value={c.debtKind}
                              onChange={(e) =>
                                update(r.id, {
                                  debtKind: e.target
                                    .value as ImportChoice["debtKind"],
                                  interestMinor: 0,
                                })
                              }
                            >
                              <option value="repayment">Repayment</option>
                              <option value="advance">
                                More money lent / borrowed
                              </option>
                            </select>
                          </label>
                          <label>
                            Interest included
                            <input
                              aria-label={`Interest for statement row ${r.line}`}
                              inputMode="decimal"
                              defaultValue="0"
                              onChange={(e) => {
                                try {
                                  const n = e.target.value.trim();
                                  e.target.setCustomValidity("");
                                  update(r.id, {
                                    interestMinor:
                                      !n || /^0(?:\.0{1,2})?$/.test(n)
                                        ? 0
                                        : parseAmount(n),
                                  });
                                } catch {
                                  e.target.setCustomValidity(
                                    "Enter a valid interest amount.",
                                  );
                                  update(r.id, { interestMinor: -1 });
                                }
                              }}
                            />
                          </label>
                        </div>
                      )}
                      {(matches.length > 0 || r.withinFileDuplicate) && (
                        <div className="duplicate-review">
                          <p>
                            {r.withinFileDuplicate
                              ? "Similar row appears earlier in this file. "
                              : ""}
                            {matches.length
                              ? `${matches.length} existing movement(s) have the same account, date, direction and amount.`
                              : ""}
                          </p>
                          <p>
                            Linking keeps the existing type and category.
                            Correct them in the original record if needed.
                          </p>
                          <label>
                            Duplicate decision
                            <select
                              aria-label={`Duplicate decision for row ${r.line}`}
                              value={c.duplicateDecision}
                              onChange={(e) =>
                                update(r.id, {
                                  duplicateDecision: e.target
                                    .value as ImportChoice["duplicateDecision"],
                                  selected:
                                    (e.target.value === "new" &&
                                      c.kind !== "review" &&
                                      c.kind !== "skip") ||
                                    e.target.value === "link",
                                })
                              }
                            >
                              <option value="pending">
                                Review before selecting
                              </option>
                              <option value="new">
                                Add as a separate transaction
                              </option>
                              {matches.length > 0 && (
                                <option value="link">
                                  Same transaction — link existing
                                </option>
                              )}
                              <option value="skip">Skip</option>
                            </select>
                          </label>
                          {c.duplicateDecision === "link" && (
                            <label>
                              Existing movement
                              <select
                                aria-label={`Existing match for row ${r.line}`}
                                value={c.matchId}
                                onChange={(e) =>
                                  update(r.id, { matchId: e.target.value })
                                }
                              >
                                <option value="">
                                  Choose the matching record
                                </option>
                                {matches.map((m) => (
                                  <option
                                    key={`${m.target}-${m.id}`}
                                    value={`${m.target}:${m.id}`}
                                  >
                                    {m.note || m.target} · {m.target}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </article>
              );
            })}
          </div>
          <div className="import-pagination">
            <button
              className="outline"
              disabled={page === 0}
              onClick={() => setPage((n) => n - 1)}
            >
              Previous
            </button>
            <span>
              {page + 1} / {maxPage + 1}
            </span>
            <button
              className="outline"
              disabled={page >= maxPage}
              onClick={() => setPage((n) => n + 1)}
            >
              Next
            </button>
          </div>
          <label className="review-check">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            I reviewed the dates, amounts, payment types and duplicate
            decisions.
          </label>
          <button
            className="primary save"
            disabled={!reviewed || !selected.length || reviewNeeded > 0}
            onClick={importRows}
          >
            Import {selected.length} selected rows
          </button>
        </>
      )}
      {(ledger.imports || []).some((b) => b.currency === currency) && (
        <details className="finance-box import-history">
          <summary>Import history</summary>
          {ledger.imports
            ?.filter((b) => b.currency === currency)
            .slice(-10)
            .reverse()
            .map((b) => (
              <p className="muted" key={b.id}>
                {b.name} · {b.rowCount} rows added/linked ·{" "}
                {new Date(b.createdAt).toLocaleDateString()} ·{" "}
                {accounts.find((a) => a.id === b.accountId)?.name}
              </p>
            ))}
        </details>
      )}
    </section>
  );
}
