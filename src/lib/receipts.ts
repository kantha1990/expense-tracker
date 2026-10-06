import { fromBS } from "./calendar";
import { Category, Currency, validDate } from "./expenses";
export type ReceiptSuggestion = {
  amount: string;
  merchant: string;
  date: string;
  currency?: Currency;
  category: Category;
  subcategory: string;
  candidates: { label: string; amount: string }[];
  text: string;
};
export function parseReceipt(raw: string): ReceiptSuggestion {
  const text = raw.replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d)));
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const candidates: { label: string; amount: string; score: number }[] = [];
  for (const line of lines) {
    if (
      /sub\s*total|tax\s*total|^\s*(vat|tax)\b|change|cash\s*tender|received|discount|balance\s*forward|बाँकी|छुट/i.test(
        line,
      )
    )
      continue;
    let score =
      /grand\s*total|net\s*(total|amount)|amount\s*(due|payable)|total\s*(due|payable)|कुल\s*जम्मा|तिर्नुपर्ने/i.test(
        line,
      )
        ? 3
        : /\btotal\b|जम्मा|कुल/i.test(line)
          ? 2
          : 0;
    if (!score) continue;
    const amounts = [
      ...line.matchAll(/(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?/g),
    ];
    const last = amounts.at(-1)?.[0];
    if (last) {
      const n = Number(last.replaceAll(",", ""));
      if (n > 0 && n <= 999999999.99)
        candidates.push({ label: line, amount: n.toFixed(2), score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const unique = candidates.filter(
    (c, i, a) => a.findIndex((x) => x.amount === c.amount) === i,
  );
  let date = "";
  const match = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (match && Number(match[1]) <= new Date().getFullYear()) {
    const d = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
    if (validDate(d)) date = d;
  } else if (match && Number(match[1]) >= 2070 && Number(match[1]) <= 2090) {
    try {
      date = fromBS(`${match[1]}-${match[2]}-${match[3]}`);
    } catch {}
  }
  const currency: Currency | undefined = /\bUSD\b|US\$/.test(text)
    ? "USD"
    : /\bINR\b/.test(text)
      ? "INR"
      : /\bNPR\b|रु\.?|Rs\.?/i.test(text)
        ? "NPR"
        : undefined;
  let category: Category = "Other",
    subcategory = "Other";
  if (/grocery|supermarket|mart\b|groceries|किराना/i.test(text)) {
    category = "Household";
    subcategory = "Groceries";
  }
  if (/vegetable|veggies|फलफूल|तरकारी/i.test(text)) {
    category = "Household";
    subcategory = "Vegetables & fruits";
  } else if (/pharmacy|medicine|medical|औषधि/i.test(text)) {
    category = "Health";
    subcategory = "Medicines";
  } else if (/restaurant|cafe|coffee|खाजा/i.test(text)) {
    category = "Food";
    subcategory = "Dining out";
  }
  return {
    amount: unique[0]?.amount || "",
    merchant:
      lines
        .find(
          (l) =>
            /[A-Za-z\u0900-\u097f]/.test(l) &&
            !/^\s*(bill|invoice|receipt|date|tax)/i.test(l),
        )
        ?.slice(0, 120) || "",
    date,
    currency,
    category,
    subcategory,
    candidates: unique.map(({ label, amount }) => ({ label, amount })),
    text: raw,
  };
}
