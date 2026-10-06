import NepaliDate from "nepali-date-converter";
import { localDate, validDate } from "./expenses";
export const bsMonths = [
  "Baisakh",
  "Jestha",
  "Ashadh",
  "Shrawan",
  "Bhadra",
  "Ashwin",
  "Kartik",
  "Mangsir",
  "Poush",
  "Magh",
  "Falgun",
  "Chaitra",
];
export function latinDigits(value: string) {
  return value.replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d)));
}
export function toBS(ad: string) {
  if (!validDate(ad)) throw Error("Enter a valid AD date.");
  return new NepaliDate(new Date(ad + "T12:00:00"));
}
export function bsISO(ad: string) {
  return toBS(ad).format("YYYY-MM-DD", "en");
}
export function fromBS(value: string) {
  const v = latinDigits(value).trim();
  if (!/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(v))
    throw Error("Use BS year-month-day, for example 2083-06-20.");
  const [y, m, d] = v.split(/[-/]/).map(Number);
  if (y < 2000 || y > 2090 || m < 1 || m > 12 || d < 1 || d > 32)
    throw Error(
      "BS dates must be within 2000–2090 and have a valid month/day.",
    );
  let bs;
  try {
    bs = new NepaliDate(y, m - 1, d);
  } catch {
    throw Error("This BS date is outside the supported calendar.");
  }
  if (bs.getYear() !== y || bs.getMonth() !== m - 1 || bs.getDate() !== d)
    throw Error("That day does not exist in this BS month.");
  return localDate(bs.toJsDate());
}
export function displayDate(ad: string, mode: "AD" | "BS" = "AD") {
  if (mode === "BS") {
    try {
      return toBS(ad).format("DD MMMM YYYY", "en") + " BS";
    } catch {
      return ad + " AD";
    }
  }
  return new Date(ad + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
export function addDays(ad: string, days: number) {
  const d = new Date(ad + "T12:00:00");
  d.setDate(d.getDate() + days);
  return localDate(d);
}
export type Period = { start: string; end: string; label: string };
export function budgetPeriod(
  today: string,
  mode: "AD" | "BS" | "payday" = "AD",
  day = 1,
): Period {
  if (mode === "BS") {
    const b = toBS(today),
      year = b.getYear(),
      month = b.getMonth();
    const start = localDate(new NepaliDate(year, month, 1).toJsDate());
    const next = localDate(
      new NepaliDate(
        month === 11 ? year + 1 : year,
        (month + 1) % 12,
        1,
      ).toJsDate(),
    );
    return {
      start,
      end: addDays(next, -1),
      label: `${bsMonths[month]} ${year} BS`,
    };
  }
  const d = new Date(today + "T12:00:00"),
    y = d.getFullYear(),
    m = d.getMonth();
  const at = (year: number, month: number) =>
    localDate(
      new Date(
        year,
        month,
        Math.min(
          mode === "payday" ? day : 1,
          new Date(year, month + 1, 0).getDate(),
        ),
      ),
    );
  let start = at(y, m);
  if (start > today) start = at(y, m - 1);
  const s = new Date(start + "T12:00:00");
  const end = addDays(at(s.getFullYear(), s.getMonth() + 1), -1);
  return {
    start,
    end,
    label:
      mode === "payday"
        ? `${displayDate(start)} – ${displayDate(end)}`
        : d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
  };
}
