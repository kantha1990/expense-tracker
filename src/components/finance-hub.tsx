"use client";
import { useState } from "react";
import { Currency } from "@/lib/expenses";
import MoneySpace from "./money-space";
import Udharo from "./udharo";
import StatementImport from "./statement-import";
export default function FinanceHub(props: {
  currency: Currency;
  revision: number;
  onChange: (message: string) => void;
}) {
  const [view, setView] = useState("accounts");
  return (
    <>
      <div className="finance-tabs" aria-label="Account tools">
        {[
          ["accounts", "Accounts & income"],
          ["udharo", "Udharo"],
          ["import", "Import statement"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={view === id}
            className={view === id ? "chosen" : ""}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {view === "accounts" ? (
        <MoneySpace {...props} />
      ) : view === "udharo" ? (
        <Udharo {...props} />
      ) : (
        <StatementImport {...props} />
      )}
    </>
  );
}
