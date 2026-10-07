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
  // Match labels separately from numbers: OCR often joins words or reads O as 0.
  const labelText = (line: string) =>
    line
      .toLowerCase()
      .replace(/!/g, "l")
      .replace(/0/g, "o")
      .replace(/1/g, "l")
      .replace(/[^a-z\u0900-\u097f]/g, "");
  function labelScore(line: string) {
    const label = labelText(line);
    if (
      /subtotal|subtota[lij]|taxtotal|totaltax|totalvat|totalsavings|totalqty|totalquantity|totalitems|totalunits|change|cashtender|cashreceived|amountreceived|discount|balanceforward|छुट|बाँकी/.test(
        label,
      ) ||
      /^(vat|tax)\b/i.test(line)
    )
      return 0;
    if (
      /grandtota[lij]|grandtota$|net(total|amount)|amount(due|payable)|total(due|payable)|कुलजम्मा|तिर्नुपर्ने/.test(
        label,
      )
    )
      return 4;
    if (/tota[lij]|जम्मा|कुल/.test(label)) return 2;
    return 0;
  }
  function amountsIn(line: string) {
    const found: string[] = [];
    // Indian and western grouping; punctuation belongs to the entire token.
    const normalized = line
      .replace(/NPR|INR|USD|Rs\.?|रु\.?/gi, " ")
      .replace(/\d[\dOoIl,.]*/g, (token) =>
        token.replace(/[Oo]/g, "0").replace(/[Il]/g, "1"),
      );
    for (const match of normalized.matchAll(/\d[\d,.]*/g)) {
      if (/^\s*%/.test(normalized.slice(match.index! + match[0].length)))
        continue;
      const token = match[0].replace(/[.,]$/, "");
      if (
        !/^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/.test(
          token,
        )
      )
        continue;
      const n = Number(token.replaceAll(",", ""));
      if (n > 0 && n <= 999999999.99) found.push(n.toFixed(2));
    }
    return found;
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const score = labelScore(line);
    if (!score) continue;
    // Ignore total quantities/counts even when OCR adds punctuation.
    const amounts = amountsIn(line);
    let amount = amounts.at(-1),
      label = line;
    // A label-only line can be followed by a currency/amount-only line.
    // Never cross another label, item, date or tax line looking for a number.
    if (!amount) {
      for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j++) {
        const next = lines[j];
        const valueOnly = next.replace(
          /NPR|INR|USD|Rs\.?|रु\.?|[\s:$=₹]/gi,
          "",
        );
        if (!valueOnly) continue;
        if (!/^[\dOoIl,.]+$/.test(valueOnly)) break;
        const values = amountsIn(next);
        if (values.length === 1) {
          amount = values[0];
          label += " · " + next;
        }
        break;
      }
    }
    if (amount) candidates.push({ label, amount, score });
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
