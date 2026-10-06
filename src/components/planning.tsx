"use client";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, ShieldCheck, Target } from "lucide-react";
import {
  categories,
  Category,
  Currency,
  Ledger,
  localDate,
  money,
  parseAmount,
} from "@/lib/expenses";
import {
  BudgetPlan,
  defaultPlan,
  emptyLedger,
  planningSummary,
} from "@/lib/finance";
import { displayDate } from "@/lib/calendar";
import { readLedger, writeLedger } from "@/lib/storage";
const numberString = (n: number) => (n ? (n / 100).toFixed(2) : "");
const optionalAmount = (v: string) =>
  !v.trim() || /^0(?:\.0{1,2})?$/.test(v.trim()) ? 0 : parseAmount(v.trim());
export default function Planning({
  currency,
  revision,
  onChange,
  compact = false,
  onOpen,
}: {
  currency: Currency;
  revision: number;
  onChange: (message: string) => void;
  compact?: boolean;
  onOpen?: () => void;
}) {
  const [ledger, setLedger] = useState<Ledger>(emptyLedger()),
    [error, setError] = useState(""),
    [limit, setLimit] = useState(""),
    [reserve, setReserve] = useState(""),
    [mode, setMode] = useState<BudgetPlan["mode"]>("AD"),
    [payday, setPayday] = useState("1"),
    [caps, setCaps] = useState<Partial<Record<Category, string>>>({});
  useEffect(() => {
    try {
      const s = readLedger(),
        p =
          s.plans?.find((p) => p.currency === currency) ||
          defaultPlan(currency);
      setLedger(s);
      setLimit(numberString(p.limitMinor));
      setReserve(numberString(p.savingsReserveMinor));
      setMode(p.mode);
      setPayday(String(p.payday));
      setCaps(
        Object.fromEntries(
          Object.entries(p.categoryLimits).map(([k, v]) => [
            k,
            numberString(v!),
          ]),
        ),
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [currency, revision]);
  const summary = planningSummary(ledger, currency, localDate()),
    p = summary.plan;
  function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const categoryLimits = Object.fromEntries(
        categories.map((c) => [c, optionalAmount(caps[c] || "")]),
      );
      const plan: BudgetPlan = {
        currency,
        limitMinor: optionalAmount(limit),
        savingsReserveMinor: optionalAmount(reserve),
        mode,
        payday: Number(payday),
        categoryLimits,
      };
      const fresh = readLedger();
      const next = {
        ...fresh,
        plans: [
          ...(fresh.plans || []).filter((p) => p.currency !== currency),
          plan,
        ],
      };
      writeLedger(next);
      setLedger(next);
      setError("");
      onChange("Budget plan saved.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="planning">
      <div className="section-title">
        <h2>
          <Target size={17} /> Your spending plan
        </h2>
        {compact && (
          <button className="text-button" onClick={onOpen}>
            Plan budget <ArrowRight size={15} />
          </button>
        )}
      </div>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <div className="plan-hero">
        <div>
          <div className="eyebrow">AVAILABLE UNTIL PERIOD END</div>
          <strong className={summary.available < 0 ? "negative" : ""}>
            {summary.hasAccounts
              ? money(summary.available, currency)
              : "Add your balances"}
          </strong>
          <p>
            <CalendarDays size={13} /> {summary.period.label}
          </p>
        </div>
        <ShieldCheck size={30} />
      </div>
      <p className="section-help">
        An estimate from tracked accounts, after reserving all tracked card
        balances, unpaid scheduled bills through{" "}
        {displayDate(summary.period.end, ledger.dateDisplay)}, and savings.
        Expected salary is excluded until received.
      </p>
      {summary.unlinked > 0 && (
        <p className="coverage-warning">
          {summary.unlinked} expense{summary.unlinked > 1 ? "s are" : " is"} not
          linked to an account since tracking began. Check your balances before
          relying on this estimate.
        </p>
      )}
      <div className="plan-metrics">
        <div>
          <span>Recorded balances</span>
          <strong>{money(summary.cash, currency)}</strong>
        </div>
        <div>
          <span>Card reserve</span>
          <strong>{money(summary.outstanding, currency)}</strong>
        </div>
        <div>
          <span>Unpaid bills</span>
          <strong>{money(summary.bills, currency)}</strong>
        </div>
        <div>
          <span>Savings reserve</span>
          <strong>{money(p.savingsReserveMinor, currency)}</strong>
        </div>
      </div>
      {!compact && (
        <>
          <div className="budget-overview">
            <div>
              <span>Income received</span>
              <strong>{money(summary.income, currency)}</strong>
            </div>
            <div>
              <span>Spent in period</span>
              <strong>{money(summary.spent, currency)}</strong>
            </div>
            <div>
              <span>
                {p.limitMinor ? "Budget remaining" : "No overall budget set"}
              </span>
              <strong
                className={
                  p.limitMinor && summary.spent > p.limitMinor ? "negative" : ""
                }
              >
                {p.limitMinor
                  ? money(p.limitMinor - summary.spent, currency)
                  : "—"}
              </strong>
            </div>
          </div>
          {p.limitMinor > 0 && (
            <div className="track budget-track">
              <div
                style={{
                  width: `${Math.min(100, (summary.spent / p.limitMinor) * 100)}%`,
                  background:
                    summary.spent > p.limitMinor ? "#bb725c" : undefined,
                }}
              />
            </div>
          )}
          <div className="budget-categories">
            {categories
              .filter((c) => (p.categoryLimits[c] || 0) > 0)
              .map((c) => {
                const used = ledger.expenses
                    .filter(
                      (e) =>
                        e.currency === currency &&
                        e.kind !== "transfer" &&
                        e.category === c &&
                        e.date >= summary.period.start &&
                        e.date <= localDate(),
                    )
                    .reduce((s, e) => s + e.amountMinor, 0),
                  cap = p.categoryLimits[c]!;
                return (
                  <div key={c}>
                    <div>
                      <strong>{c}</strong>
                      <span className={used > cap ? "negative" : ""}>
                        {money(used, currency)} / {money(cap, currency)}
                      </span>
                    </div>
                    <div className="track">
                      <div
                        style={{
                          width: `${Math.min(100, (used / cap) * 100)}%`,
                          background: used > cap ? "#bb725c" : undefined,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
          <details className="finance-box budget-settings">
            <summary>Set budget & savings reserve</summary>
            <form className="finance-form" onSubmit={save}>
              <div className="form-row">
                <label>
                  Overall spending budget ({currency})
                  <input
                    aria-label="Overall spending budget"
                    inputMode="decimal"
                    placeholder="Optional"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                  />
                </label>
                <label>
                  Remaining savings to set aside ({currency})
                  <input
                    aria-label="Remaining savings reserve"
                    inputMode="decimal"
                    placeholder="0"
                    value={reserve}
                    onChange={(e) => setReserve(e.target.value)}
                  />
                </label>
              </div>
              <p className="muted">
                The savings reserve is a plan, not an expense. Reduce it after
                you move savings outside your tracked accounts. Category limits
                are independent caps.
              </p>
              <div className="form-row">
                <label>
                  Budget period
                  <select
                    aria-label="Budget period"
                    value={mode}
                    onChange={(e) =>
                      setMode(e.target.value as BudgetPlan["mode"])
                    }
                  >
                    <option value="AD">AD calendar month</option>
                    <option value="BS">BS Nepali month</option>
                    <option value="payday">Salary-day cycle (AD)</option>
                  </select>
                </label>
                {mode === "payday" && (
                  <label>
                    Salary day
                    <input
                      aria-label="Salary day"
                      type="number"
                      min="1"
                      max="31"
                      required
                      value={payday}
                      onChange={(e) => setPayday(e.target.value)}
                    />
                  </label>
                )}
              </div>
              <p className="muted">
                Salary-day cycles use AD dates and clamp to shorter months. BS
                budgets follow Nepali calendar month boundaries.
              </p>
              <div className="form-row caps">
                {categories.map((c) => (
                  <label key={c}>
                    {c} limit ({currency})
                    <input
                      aria-label={`${c} budget limit`}
                      inputMode="decimal"
                      placeholder="Optional"
                      value={caps[c] || ""}
                      onChange={(e) =>
                        setCaps({ ...caps, [c]: e.target.value })
                      }
                    />
                  </label>
                ))}
              </div>
              <button className="primary">Save budget plan</button>
            </form>
          </details>
        </>
      )}
    </section>
  );
}
