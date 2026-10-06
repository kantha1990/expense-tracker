"use client";
import { useEffect, useRef, useState } from "react";
import { bsISO, displayDate, fromBS } from "@/lib/calendar";
export default function DateField({
  value,
  onChange,
  label = "Date",
  mode = "AD",
  max,
}: {
  value: string;
  onChange: (date: string) => void;
  label?: string;
  mode?: "AD" | "BS";
  max?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [bs, setBs] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    input.current?.setCustomValidity("");
    try {
      setBs(bsISO(value));
      setError("");
    } catch {
      setBs("");
    }
  }, [value, mode]);
  return (
    <label className="extra-label">
      {label} ({mode})
      {mode === "AD" ? (
        <input
          type="date"
          required
          value={value}
          max={max}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          ref={input}
          required
          aria-label={`${label} (BS)`}
          placeholder="2083-06-20"
          value={bs}
          onChange={(e) => {
            const raw = e.target.value;
            setBs(raw);
            try {
              const ad = fromBS(raw);
              if (max && ad > max) throw Error("Choose today or a past date.");
              e.target.setCustomValidity("");
              setError("");
              onChange(ad);
            } catch (err) {
              const message = (err as Error).message;
              e.target.setCustomValidity(message);
              setError(message);
            }
          }}
        />
      )}
      <span>
        {error ||
          (mode === "BS"
            ? `${value} AD · Stored as AD`
            : (() => {
                try {
                  return displayDate(value, "BS");
                } catch {
                  return "BS conversion unavailable";
                }
              })())}
      </span>
    </label>
  );
}
