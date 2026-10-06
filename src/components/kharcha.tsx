"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Check,
  ChevronRight,
  CreditCard,
  Download,
  HeartPulse,
  House,
  LayoutDashboard,
  Leaf,
  Plus,
  ReceiptText,
  ShoppingBag,
  TramFront,
  Trash2,
  Utensils,
  Wallet,
  X,
  Landmark,
  MoreHorizontal,
  Target,
  Search,
} from "lucide-react";
import {
  categories,
  subcategories,
  isSpending,
  currencies,
  Currency,
  Expense,
  localDate,
  money,
  parseAmount,
  paymentMethods,
  totals,
  cardBalance,
} from "@/lib/expenses";
import { localExpenseRepository, readLedger, writeLedger } from "@/lib/storage";
import Commitments from "./commitments";
import BillScanner from "./bill-scanner";
import { ReceiptSuggestion } from "@/lib/receipts";
import Planning from "./planning";
import FinanceHub from "./finance-hub";
import BackupTools from "./backup-tools";
import DateField from "./date-field";
import {
  compatibleAccounts,
  emptyLedger,
  planningSummary,
} from "@/lib/finance";
import { displayDate } from "@/lib/calendar";
const categoryIcons = {
  Food: Utensils,
  Transport: TramFront,
  Shopping: ShoppingBag,
  Household: House,
  Bills: ReceiptText,
  EMI: Landmark,
  Family: HeartPulse,
  Health: HeartPulse,
  Travel: TramFront,
  Other: MoreHorizontal,
};
type InstallEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export default function Kharcha() {
  const [expenses, setExpenses] = useState<Expense[]>([]),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [blocked, setBlocked] = useState(false),
    [tab, setTab] = useState("overview"),
    [currency, setCurrency] = useState<Currency>("NPR"),
    [today, setToday] = useState(localDate()),
    [install, setInstall] = useState<InstallEvent | null>(null),
    [notice, setNotice] = useState("");
  const [subcategory, setSubcategory] = useState("Meals"),
    [cardId, setCardId] = useState(""),
    [emiInterest, setEmiInterest] = useState("0"),
    [editing, setEditing] = useState<Expense | null>(null),
    [revision, setRevision] = useState(0),
    [scanEpoch, setScanEpoch] = useState(0),
    [scanned, setScanned] = useState(false),
    [scanBusy, setScanBusy] = useState(false),
    [reviewed, setReviewed] = useState(false);
  const [ledger, setLedger] = useState(emptyLedger()),
    [accountId, setAccountId] = useState(""),
    [query, setQuery] = useState(""),
    [filterCategory, setFilterCategory] = useState(""),
    [filterMethod, setFilterMethod] = useState("");
  const [cards, setCards] = useState<ReturnType<typeof readLedger>["cards"]>(
    [],
  );
  const dialog = useRef<HTMLDialogElement>(null),
    amountInput = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState(""),
    [category, setCategory] = useState<Expense["category"]>("Food"),
    [method, setMethod] = useState<Expense["paymentMethod"]>("Cash"),
    [note, setNote] = useState(""),
    [date, setDate] = useState(localDate());
  useEffect(() => {
    try {
      setExpenses(localExpenseRepository.list());
      setCards(readLedger().cards);
      setLedger(readLedger());
    } catch (e) {
      setError((e as Error).message);
      setBlocked(true);
    }
    setReady(true);
    const tick = () => setToday(localDate());
    const timer = setInterval(tick, 30000);
    const update = () => {
      try {
        setExpenses(localExpenseRepository.list());
        setCards(readLedger().cards);
        setLedger(readLedger());
        setRevision((x) => x + 1);
      } catch {
        setError("Could not refresh saved expenses.");
        setBlocked(true);
      }
    };
    window.addEventListener("storage", update);
    const handler = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .register("/sw.js")
        .catch(() => setNotice("Offline mode is unavailable in this browser."));
    return () => {
      clearInterval(timer);
      window.removeEventListener("storage", update);
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);
  useEffect(() => {
    try {
      setCards(readLedger().cards);
      setLedger(readLedger());
    } catch {}
  }, [revision]);
  const planSummary = planningSummary(ledger, currency, today);
  const monthExpenses = expenses.filter(
      (e) =>
        e.currency === currency &&
        isSpending(e) &&
        e.date >= planSummary.period.start &&
        e.date <= today,
    ),
    sum = {
      today: totals(expenses, today, currency).today,
      month: planSummary.spent,
    },
    transactions = expenses
      .filter(
        (e) =>
          e.currency === currency &&
          (tab !== "transactions" ||
            ((!filterCategory || e.category === filterCategory) &&
              (!filterMethod || e.paymentMethod === filterMethod) &&
              `${e.note} ${e.category} ${e.subcategory || ""} ${e.date}`
                .toLowerCase()
                .includes(query.toLowerCase()))),
      )
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          b.createdAt.localeCompare(a.createdAt),
      );
  function open() {
    setEditing(null);
    setAmount("");
    setNote("");
    setDate(localDate());
    setCategory("Food");
    setSubcategory("Meals");
    setMethod("Cash");
    setCardId("");
    setAccountId("");
    setEmiInterest("0");
    setScanned(false);
    setReviewed(false);
    setScanBusy(false);
    setScanEpoch((x) => x + 1);
    setError("");
    dialog.current?.showModal();
    amountInput.current?.focus();
  }
  function edit(e: Expense) {
    if (e.debtEventId) {
      setError(
        "This interest is linked to Udharo. Correct the movement under Accounts → Udharo.",
      );
      return;
    }
    setEditing(e);
    setCurrency(e.currency);
    setAmount((e.amountMinor / 100).toFixed(2));
    setNote(e.note);
    setDate(e.date);
    setCategory(e.category);
    setSubcategory(
      e.kind === "transfer"
        ? "Credit card repayment"
        : e.subcategory || subcategories[e.category][0],
    );
    setMethod(e.paymentMethod);
    setCardId(e.cardId || "");
    setAccountId(e.accountId || "");
    setEmiInterest(((e.interestMinor || 0) / 100).toFixed(2));
    setScanned(false);
    setReviewed(false);
    setScanBusy(false);
    setScanEpoch((x) => x + 1);
    setError("");
    dialog.current?.showModal();
  }
  function scannedBill(r: ReceiptSuggestion) {
    if (r.amount) setAmount(r.amount);
    if (r.merchant) setNote(r.merchant);
    if (r.date && r.date <= localDate()) setDate(r.date);
    if (r.currency) setCurrency(r.currency);
    setCategory(r.category);
    setSubcategory(r.subcategory);
    setScanned(true);
    setReviewed(false);
  }

  function refresh(message = "") {
    try {
      const next = readLedger();
      setExpenses(next.expenses);
      setCards(next.cards);
      setLedger(next);
      setBlocked(false);
      setError("");
      setRevision((x) => x + 1);
      if (message) setNotice(message);
    } catch (e) {
      setError((e as Error).message);
      setBlocked(true);
    }
  }
  function persist(next: Expense[]) {
    if (blocked) {
      setError(
        "Saved data is unreadable. Please recover it before adding expenses.",
      );
      return false;
    }
    try {
      localExpenseRepository.save(next);
      setExpenses(next);
      setRevision((x) => x + 1);
      setError("");
      return true;
    } catch {
      setError("Unable to save. Your device storage may be full or disabled.");
      return false;
    }
  }
  function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (scanBusy) throw Error("Wait for the scan to finish.");
      if (scanned && !reviewed)
        throw Error("Review the scanned bill before saving.");
      const amountMinor = parseAmount(amount);
      if (!date || date > localDate())
        throw new Error("Choose today or a past date.");
      const now = new Date().toISOString();
      const ledger = readLedger();
      const fresh = ledger.expenses;
      if (editing && !fresh.some((x) => x.id === editing.id))
        throw Error("This expense was removed in another tab.");
      if (
        editing &&
        fresh.find((x) => x.id === editing.id)?.updatedAt !== editing.updatedAt
      )
        throw Error(
          "This expense changed in another tab. Close and reopen it to edit.",
        );
      if (
        method === "Credit Card" &&
        !ledger.cards.some((c) => c.id === cardId && c.currency === currency)
      )
        throw Error(
          "Add a credit card below the dashboard, then select it here.",
        );
      const transfer = editing?.kind === "transfer";
      if (transfer) {
        const c = ledger.cards.find((c) => c.id === editing.cardId);
        if (!c) throw Error("Linked card no longer exists.");
        const outstanding = cardBalance(
          c,
          fresh.filter((x) => x.id !== editing.id),
        );
        if (amountMinor > Math.max(0, outstanding))
          throw Error("Repayment exceeds the tracked outstanding balance.");
      }
      const interestMinor =
        category === "EMI" && emiInterest !== "0" && emiInterest !== "0.00"
          ? parseAmount(emiInterest)
          : 0;
      if (interestMinor > amountMinor)
        throw Error("Interest cannot exceed the EMI amount.");
      const record: Expense = {
        id: editing?.id || crypto.randomUUID(),
        amountMinor,
        currency,
        category: transfer ? "Other" : category,
        subcategory: transfer ? "Credit card repayment" : subcategory,
        paymentMethod: transfer ? "Bank" : method,
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
        kind: transfer ? "transfer" : "expense",
        cardId: transfer
          ? editing?.cardId
          : method === "Credit Card"
            ? cardId
            : undefined,
        accountId:
          method === "Credit Card" ? undefined : accountId || undefined,
        ...(category === "EMI"
          ? { interestMinor, principalMinor: amountMinor - interestMinor }
          : {}),
        ...(editing?.scheduleId
          ? {
              scheduleId: editing.scheduleId,
              scheduledFor: editing.scheduledFor,
            }
          : {}),
      };
      if (
        persist(
          editing
            ? fresh.map((x) => (x.id === editing.id ? record : x))
            : [...fresh, record],
        )
      ) {
        dialog.current?.close();
        setNotice(
          editing
            ? "Transaction updated."
            : "Expense saved. You’re all caught up.",
        );
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function remove(id: string) {
    if (expenses.find((e) => e.id === id)?.debtEventId) {
      setError(
        "Remove this interest through its Udharo movement under Accounts → Udharo.",
      );
      return;
    }
    if (expenses.find((e) => e.id === id)?.scheduleId) {
      setError(
        "This payment advances a recurring schedule. Edit its details instead of deleting it.",
      );
      return;
    }
    if (!confirm("Delete this expense?")) return;
    try {
      if (persist(localExpenseRepository.list().filter((e) => e.id !== id)))
        setNotice("Expense deleted.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const monthLabel = planSummary.period.label;
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Kharcha home">
          <span className="logo">
            k<span>•</span>
          </span>
          kharcha<span className="brand-dot">.</span>
        </a>
        <p className="tagline">A little clarity. Every day.</p>
        <div className="side-nav">
          <button
            className={tab === "overview" ? "active" : ""}
            onClick={() => setTab("overview")}
          >
            <LayoutDashboard size={20} />
            Overview
          </button>
          <button
            className={tab === "transactions" ? "active" : ""}
            onClick={() => setTab("transactions")}
          >
            <ReceiptText size={20} />
            Transactions
          </button>
          <button
            className={tab === "plan" ? "active" : ""}
            onClick={() => setTab("plan")}
          >
            <Target size={20} />
            Budget & bills
          </button>
          <button
            className={tab === "money" ? "active" : ""}
            onClick={() => setTab("money")}
          >
            <Wallet size={20} />
            Accounts & income
          </button>
        </div>
        <div className="side-bottom">
          <Leaf size={24} />
          <h3>
            Small habits.
            <br />A clearer tomorrow.
          </h3>
          <p>
            Know where your money goes,
            <br />
            one expense at a time.
          </p>
          <span>
            <span className="status-dot" /> Stored on your device
          </span>
        </div>
      </aside>
      <main>
        <header>
          <div className="mobile-brand">
            kharcha<span>.</span>
          </div>
          <div className="breadcrumb">Your personal money space</div>
          <div className="header-actions">
            <label className="calendar-select">
              <select
                aria-label="Date display"
                value={ledger.dateDisplay || "AD"}
                disabled={!ready || blocked}
                onChange={(e) => {
                  try {
                    writeLedger({
                      ...readLedger(),
                      dateDisplay: e.target.value as "AD" | "BS",
                    });
                    refresh();
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              >
                <option value="AD">AD dates</option>
                <option value="BS">BS dates</option>
              </select>
            </label>
            <label className="currency">
              <Wallet size={16} />
              <select
                aria-label="Display and new expense currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
              >
                {currencies.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <span className="avatar">SK</span>
          </div>
        </header>
        <div className="content">
          <section className="heading">
            <div>
              <div className="eyebrow">EVERYDAY SPENDING, MADE SIMPLE</div>
              <h1>
                {tab === "overview"
                  ? "Your money, at a glance."
                  : tab === "plan"
                    ? "Make room for what matters."
                    : tab === "money"
                      ? "All your money, together."
                      : "Every little expense."}
              </h1>
              <p>
                {tab === "overview"
                  ? "A clear view of what you spend. More room for what matters."
                  : tab === "plan"
                    ? "Plan your budget, bills and savings until payday."
                    : tab === "money"
                      ? "Track cash, banks, wallets, income and transfers."
                      : "Your spending story, one transaction at a time."}
              </p>
            </div>
            <button
              className="primary desktop-add"
              disabled={!ready || blocked}
              onClick={open}
            >
              <Plus size={18} /> Add expense
            </button>
          </section>
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {!ready ? (
            <p role="status">Loading your expenses…</p>
          ) : (
            <>
              {tab === "overview" && (
                <>
                  <section className="summary-grid">
                    <div className="month-card">
                      <div className="card-top">
                        <span>
                          {planSummary.plan.mode === "AD"
                            ? "This month"
                            : "This budget period"}
                        </span>
                        <span className="round-icon">
                          <Wallet size={19} />
                        </span>
                      </div>
                      <div className="total">{money(sum.month, currency)}</div>
                      <div className="month-footer">
                        <span>{monthLabel}</span>
                        <span>
                          {monthExpenses.length} expenses{" "}
                          <ArrowUpRight size={16} />
                        </span>
                      </div>
                      <div className="decor-circle" />
                    </div>
                    <div className="today-card">
                      <div className="card-top">
                        <span>Spent today</span>
                        <span className="light-round">
                          <ArrowUpRight size={19} />
                        </span>
                      </div>
                      <div className="total">{money(sum.today, currency)}</div>
                      <p>
                        {new Date(today + "T12:00:00").toLocaleDateString(
                          "en-US",
                          { weekday: "long", month: "short", day: "numeric" },
                        )}
                        <span className="tiny-dot" />
                        {
                          transactions.filter(
                            (e) => e.date === today && isSpending(e),
                          ).length
                        }{" "}
                        expenses
                      </p>
                    </div>
                  </section>
                  <Planning
                    currency={currency}
                    revision={revision}
                    compact
                    onOpen={() => setTab("plan")}
                    onChange={refresh}
                  />
                  <section className="category-section">
                    <div className="section-title">
                      <h2>Where it goes</h2>
                      <span>
                        {planSummary.plan.mode === "AD"
                          ? "This month"
                          : "This budget period"}
                      </span>
                    </div>
                    <div className="category-grid">
                      {categories.map((c) => {
                        const Icon = categoryIcons[c];
                        const amount = monthExpenses
                          .filter((e) => e.category === c)
                          .reduce((s, e) => s + e.amountMinor, 0);
                        return (
                          <div className="category-card" key={c}>
                            <span
                              className={`category-icon ${c.toLowerCase()}`}
                            >
                              <Icon size={20} />
                            </span>
                            <span className="category-name">{c}</span>
                            <strong>{money(amount, currency)}</strong>
                            <div className="track">
                              <div
                                style={{
                                  width: `${sum.month ? (amount / sum.month) * 100 : 0}%`,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </>
              )}
              {(tab === "overview" || tab === "transactions") && (
                <section className="transactions">
                  <div className="section-title">
                    <h2>
                      {tab === "overview"
                        ? "Recent transactions"
                        : "Expense activity"}{" "}
                      <span className="count">{transactions.length}</span>
                    </h2>
                    {tab === "overview" && (
                      <button
                        className="text-button"
                        onClick={() => setTab("transactions")}
                      >
                        View all <ChevronRight size={16} />
                      </button>
                    )}
                  </div>
                  {tab === "transactions" && (
                    <div className="activity-filters">
                      <label>
                        <Search size={15} />
                        <input
                          aria-label="Search expenses"
                          placeholder="Search notes, categories or AD dates"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </label>
                      <select
                        aria-label="Filter expense category"
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                      >
                        <option value="">All categories</option>
                        {categories.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                      <select
                        aria-label="Filter payment method"
                        value={filterMethod}
                        onChange={(e) => setFilterMethod(e.target.value)}
                      >
                        <option value="">All payment methods</option>
                        {[...paymentMethods, "Card"].map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {transactions.length === 0 ? (
                    <div className="empty">
                      <span className="empty-icon">
                        <ReceiptText size={30} />
                      </span>
                      <h3>
                        {query || filterCategory || filterMethod
                          ? "No matching expenses."
                          : "A fresh start for your spending."}
                      </h3>
                      <p>
                        {query || filterCategory || filterMethod
                          ? "Try another search or clear the filters."
                          : "Add your first expense. We’ll take care of the bigger picture."}
                      </p>
                      <button
                        className="outline"
                        onClick={open}
                        disabled={blocked}
                      >
                        <Plus size={17} /> Add your first expense
                      </button>
                    </div>
                  ) : (
                    <div className="transaction-list">
                      {(tab === "overview"
                        ? transactions.slice(0, 5)
                        : transactions
                      ).map((e) => {
                        const Icon = categoryIcons[e.category];
                        return (
                          <div className="transaction" key={e.id}>
                            <span
                              className={`category-icon ${e.category.toLowerCase()}`}
                            >
                              <Icon size={20} />
                            </span>
                            <div className="transaction-info">
                              <strong>{e.note || e.category}</strong>
                              <span>
                                {e.kind === "transfer"
                                  ? "Card repayment"
                                  : e.subcategory || e.category}{" "}
                                <span>·</span> {e.paymentMethod} <span>·</span>{" "}
                                {e.date === today
                                  ? "Today"
                                  : displayDate(e.date, ledger.dateDisplay)}
                              </span>
                            </div>
                            <strong className="transaction-amount">
                              {e.kind === "transfer" ? "↔ " : "−"}
                              {money(e.amountMinor, e.currency)}
                            </strong>
                            <button
                              className="edit-expense"
                              aria-label={`Edit ${e.note || e.category} expense`}
                              onClick={() => edit(e)}
                            >
                              Edit
                            </button>
                            <button
                              className="delete"
                              aria-label={`Delete ${e.note || e.category} expense`}
                              onClick={() => remove(e.id)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}
              {tab === "plan" && !blocked && (
                <Planning
                  currency={currency}
                  revision={revision}
                  onChange={refresh}
                />
              )}
              {tab === "money" && !blocked && (
                <FinanceHub
                  currency={currency}
                  revision={revision}
                  onChange={refresh}
                />
              )}
              {(tab === "overview" || tab === "plan") && !blocked && (
                <Commitments
                  currency={currency}
                  revision={revision}
                  onChange={(_next, message) => refresh(message)}
                />
              )}
            </>
          )}
          <footer>
            <span>
              <span className="status-dot" />
              Private by default. Saved on this device.
            </span>
            <div>
              <BackupTools onChange={() => refresh()} onNotice={setNotice} />
              {install ? (
                <button
                  onClick={async () => {
                    await install.prompt();
                    await install.userChoice;
                    setInstall(null);
                  }}
                >
                  Install Kharcha <ArrowDownLeft size={14} />
                </button>
              ) : (
                <button
                  onClick={() =>
                    setNotice(
                      "To install: on Android, use your browser menu → Install app. On iPhone, use Safari → Share → Add to Home Screen. HTTPS hosting is required.",
                    )
                  }
                >
                  Install help <ArrowUpRight size={14} />
                </button>
              )}
            </div>
          </footer>
        </div>
      </main>
      <nav className="mobile-nav" aria-label="Main navigation">
        <button
          className={tab === "overview" ? "selected" : ""}
          onClick={() => setTab("overview")}
        >
          <LayoutDashboard size={21} />
          Overview
        </button>
        <button
          className={tab === "plan" ? "selected" : ""}
          onClick={() => setTab("plan")}
        >
          <Target size={21} />
          Plan
        </button>
        <button
          className="add-fab"
          aria-label="Add expense"
          onClick={open}
          disabled={!ready || blocked}
        >
          <Plus size={25} />
        </button>
        <button
          className={tab === "money" ? "selected" : ""}
          onClick={() => setTab("money")}
        >
          <Wallet size={21} />
          Accounts
        </button>
        <button
          className={tab === "transactions" ? "selected" : ""}
          onClick={() => setTab("transactions")}
        >
          <ReceiptText size={21} />
          Activity
        </button>
      </nav>
      <dialog
        ref={dialog}
        aria-labelledby="expense-title"
        onClose={() => {
          setScanEpoch((x) => x + 1);
          setScanBusy(false);
        }}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current.close();
        }}
      >
        <form onSubmit={save}>
          <div className="modal-header">
            <div>
              <div className="eyebrow">THE LITTLE THINGS ADD UP</div>
              <h2 id="expense-title">
                {editing ? "Edit transaction" : "Add an expense"}
              </h2>
            </div>
            <button
              type="button"
              className="close"
              aria-label="Close expense form"
              onClick={() => dialog.current?.close()}
            >
              <X />
            </button>
          </div>
          {!editing && (
            <BillScanner
              key={scanEpoch}
              onResult={scannedBill}
              onBusy={setScanBusy}
            />
          )}
          <label className="amount-label" htmlFor="amount">
            How much did you spend?
          </label>
          <div className="amount-field">
            <span>{currency}</span>
            <input
              ref={amountInput}
              id="amount"
              inputMode="decimal"
              placeholder="0.00"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <fieldset disabled={editing?.kind === "transfer"}>
            <legend>Category</legend>
            <div className="category-picker">
              {categories.map((c) => {
                const Icon = categoryIcons[c];
                return (
                  <button
                    type="button"
                    key={c}
                    aria-pressed={category === c}
                    className={category === c ? "chosen" : ""}
                    onClick={() => {
                      setCategory(c);
                      setSubcategory(subcategories[c][0]);
                    }}
                  >
                    <Icon size={20} />
                    {c}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <label className="extra-label">
            Subcategory
            <select
              aria-label="Subcategory"
              disabled={editing?.kind === "transfer"}
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
            >
              {editing?.kind === "transfer" ? (
                <option>Credit card repayment</option>
              ) : (
                subcategories[category].map((s) => <option key={s}>{s}</option>)
              )}
            </select>
          </label>
          <fieldset disabled={editing?.kind === "transfer"}>
            <legend>Paid with</legend>
            <div className="payment-picker">
              {(method === "Card"
                ? [...paymentMethods, "Card" as const]
                : paymentMethods
              ).map((m) => {
                const Icon =
                  m === "Cash"
                    ? Banknote
                    : m.includes("Card")
                      ? CreditCard
                      : Landmark;
                return (
                  <button
                    type="button"
                    key={m}
                    aria-pressed={method === m}
                    className={method === m ? "chosen" : ""}
                    onClick={() => {
                      setMethod(m);
                      setAccountId("");
                    }}
                  >
                    <Icon size={18} />
                    {m}
                  </button>
                );
              })}
            </div>
          </fieldset>
          {method !== "Credit Card" && (
            <label className="extra-label">
              Paying account
              <select
                aria-label="Paying account"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="">Unlinked — spending only</option>
                {compatibleAccounts(ledger, currency, method).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <span>
                Link an account to update its balance. Add accounts in the
                Accounts tab.
              </span>
            </label>
          )}
          {method === "Credit Card" && (
            <label className="extra-label">
              Credit card
              <select
                aria-label="Credit card"
                required
                value={cardId}
                onChange={(e) => setCardId(e.target.value)}
              >
                <option value="">Select a card</option>
                {cards
                  .filter((c) => c.currency === currency)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
              <span>Add your card in Budget & bills first.</span>
            </label>
          )}
          {category === "EMI" && (
            <label className="extra-label">
              Interest within EMI ({currency})
              <input
                required
                inputMode="decimal"
                value={emiInterest}
                onChange={(e) => setEmiInterest(e.target.value)}
              />
              <span>
                Principal = total EMI minus interest. Use your lender’s
                breakdown.
              </span>
            </label>
          )}
          {editing?.kind === "transfer" && (
            <p className="section-help">
              Card repayment is a transfer and is excluded from spending totals.
            </p>
          )}
          <div className="form-row">
            <label>
              Note <span>(optional)</span>
              <input
                maxLength={120}
                placeholder="What was it for?"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <DateField
              key={scanEpoch}
              value={date}
              onChange={setDate}
              mode={ledger.dateDisplay}
              max={today}
            />
          </div>
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          {scanned && (
            <label className="review-check">
              <input
                required
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />{" "}
              I checked the amount, currency, date and category against the
              bill.
            </label>
          )}
          <button className="primary save" type="submit" disabled={scanBusy}>
            <Check size={18} /> {editing ? "Save changes" : "Save expense"}
          </button>
          <p className="form-footnote">
            Just for you. Saved locally in your browser.
          </p>
        </form>
      </dialog>
    </div>
  );
}
