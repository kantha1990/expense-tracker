"use client";
import { useEffect, useRef, useState } from "react";
import { prepareReceiptImage } from "@/lib/receipt-image";
import { Camera, Upload, ScanLine } from "lucide-react";
import { parseReceipt, ReceiptSuggestion } from "@/lib/receipts";
export default function BillScanner({
  onResult,
  onBusy,
  startExpanded = false,
}: {
  startExpanded?: boolean;
  onResult: (result: ReceiptSuggestion) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(startExpanded);
  const [language, setLanguage] = useState("eng"),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [error, setError] = useState(""),
    [preview, setPreview] = useState(""),
    [result, setResult] = useState<ReceiptSuggestion | null>(null);
  const camera = useRef<HTMLInputElement>(null),
    upload = useRef<HTMLInputElement>(null),
    cancel = useRef<(() => void) | null>(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancel.current?.();
    };
  }, []);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  async function scan(file: File | undefined) {
    if (!file || busy) return;
    if (
      !["image/jpeg", "image/png", "image/webp", "image/bmp"].includes(
        file.type,
      )
    ) {
      setError(
        "Use a JPG, PNG, WebP or BMP photo. PDFs and HEIC files are not supported.",
      );
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError("Choose an image smaller than 15 MB.");
      return;
    }
    setExpanded(true);
    setBusy(true);
    onBusy(true);
    setError("");
    setResult(null);

    setPreview(URL.createObjectURL(file));
    setProgress("Preparing bill scanner…");
    let worker: import("tesseract.js").Worker | undefined;
    let stopped = false;
    let rejectCancel: ((error: Error) => void) | undefined;
    const cancelled = new Promise<never>((_, reject) => {
      rejectCancel = reject;
    });
    void cancelled.catch(() => {});
    const stop = () => {
      stopped = true;
      rejectCancel?.(new Error("Scan cancelled"));
      void worker?.terminate();
    };
    cancel.current = stop;
    const timer = setTimeout(() => {
      if (mounted.current)
        setError("Scanning took too long. Try a clearer, cropped photo.");
      stop();
    }, 90000);
    try {
      let scanImage: File | Blob = file;
      try {
        scanImage = await Promise.race([
          prepareReceiptImage(file, false),
          cancelled,
        ]);
      } catch {
        if (stopped) return;
      }
      if (stopped || !mounted.current) return;
      const { createWorker, PSM } = await import("tesseract.js");
      if (!mounted.current) return;
      worker = await Promise.race([
        createWorker(language, 1, {
          workerPath: "/ocr/worker.min.js",
          corePath: "/ocr/core",
          langPath: "/ocr/lang",
          workerBlobURL: false,
          logger: (m) => {
            if (mounted.current && !stopped)
              setProgress(
                m.status === "recognizing text"
                  ? `Reading bill… ${Math.round(m.progress * 100)}%`
                  : "Loading scanner…",
              );
          },
        }).then((w) => {
          if (stopped) void w.terminate();
          return w;
        }),
        cancelled,
      ]);
      if (stopped || !mounted.current) return;
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
      let { data } = await Promise.race([
        worker.recognize(scanImage, { rotateAuto: true }),
        cancelled,
      ]);
      if (stopped || !mounted.current) return;
      let suggestion = parseReceipt(data.text);
      if (!suggestion.amount || data.confidence < 45) {
        setProgress("Looking again for Grand Total or Total…");
        try {
          const prepared = await Promise.race([
            prepareReceiptImage(file),
            cancelled,
          ]);
          if (stopped || !mounted.current) return;
          await worker.setParameters({
            tessedit_pageseg_mode: PSM.SPARSE_TEXT,
          });
          const retry = await Promise.race([
            worker.recognize(prepared, { rotateAuto: true }),
            cancelled,
          ]);
          if (stopped || !mounted.current) return;
          // Keep both readings for review instead of guessing from the largest number.
          suggestion = parseReceipt(data.text + "\n" + retry.data.text);
        } catch {
          if (stopped || !mounted.current) return;
          // Preserve the first reading if image preparation is unsupported.
        }
      }
      setResult(suggestion);
      onResult(suggestion);
      setProgress("Scan ready. Review the amount and details before saving.");
      if (!suggestion.amount)
        setError(
          "No clear total found. Enter the amount manually using the photo or extracted text.",
        );
    } catch {
      if (mounted.current && !stopped)
        setError(
          "Could not scan this image. Connect to the internet for the first scan, or enter the amount manually.",
        );
    } finally {
      clearTimeout(timer);
      await worker?.terminate().catch(() => {});
      cancel.current = null;
      if (mounted.current) {
        setBusy(false);
        onBusy(false);
      }
    }
  }
  return (
    <div className="scanner">
      <div className="scanner-heading">
        <ScanLine size={18} />
        <strong>Scan a bill</strong>
        <span>On-device OCR</span>
      </div>
      {!expanded && (
        <button
          type="button"
          className="outline scanner-open"
          onClick={() => setExpanded(true)}
        >
          <Camera size={16} /> Scan or upload a bill
        </button>
      )}
      {expanded && (
        <>
          <div className="scan-actions">
            <button
              type="button"
              className="outline"
              disabled={busy}
              onClick={() => camera.current?.click()}
            >
              <Camera size={16} /> Take photo
            </button>
            <button
              type="button"
              className="outline"
              disabled={busy}
              onClick={() => upload.current?.click()}
            >
              <Upload size={16} /> Upload bill
            </button>
          </div>
          <details className="scanner-options">
            <summary>Language & photo tips</summary>
            <p>
              Keep the whole total line in frame. The photo stays on this
              device; check the suggested amount before saving.
            </p>
            <label>
              Bill language
              <select
                value={language}
                disabled={busy}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="eng">English</option>
                <option value="eng+nep">English + Nepali</option>
              </select>
            </label>
          </details>
        </>
      )}
      <input
        hidden
        ref={camera}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/bmp"
        capture="environment"
        onChange={(e) => {
          void scan(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={upload}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/bmp"
        onChange={(e) => {
          void scan(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {preview && (
        <img
          src={preview}
          alt="Bill photo for review"
          className="bill-preview"
        />
      )}
      {progress && <p role="status">{progress}</p>}
      {busy && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            cancel.current?.();
            setProgress("Cancelling scan…");
          }}
        >
          Cancel scan
        </button>
      )}
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {result && (
        <>
          {result.candidates.length > 1 && (
            <label>
              Possible bill totals
              <select
                onChange={(e) =>
                  onResult({ ...result, amount: e.target.value })
                }
                defaultValue={result.amount}
              >
                {result.candidates.map((c) => (
                  <option key={c.amount} value={c.amount}>
                    {c.amount} · {c.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <details>
            <summary>View extracted text</summary>
            <pre className="ocr-text">
              {result.text || "No text recognized."}
            </pre>
          </details>
          <p>
            Clear year-month-day dates are suggested. Recognized BS years
            2070–2090 are converted to AD. Check the converted date, currency,
            VAT and discounts against your bill.
          </p>
        </>
      )}
    </div>
  );
}
