"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Upload, X, Undo2 } from "lucide-react";
import { Ledger, localDate } from "@/lib/expenses";
import {
  parseLedger,
  readLedger,
  RECOVERY_KEY,
  restoreLedger,
  STORAGE_KEY,
} from "@/lib/storage";
function download(raw: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([raw], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function BackupTools({
  onChange,
  onNotice,
}: {
  onChange: () => void;
  onNotice: (message: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dialog = useRef<HTMLDialogElement>(null),
    file = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Ledger | null>(null),
    [raw, setRaw] = useState(""),
    [error, setError] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [recovery, setRecovery] = useState(false),
    [selectedName, setSelectedName] = useState("");
  function open() {
    setPreview(null);
    setRaw("");
    setError("");
    setConfirmed(false);
    try {
      setRecovery(!!localStorage.getItem(RECOVERY_KEY));
    } catch {
      setRecovery(false);
      setError("Device storage is unavailable in this browser.");
    }
    setSelectedName("");
    dialog.current?.showModal();
  }
  function exportData() {
    try {
      download(
        JSON.stringify(readLedger(), null, 2),
        `kharcha-backup-${localDate()}.json`,
      );
      onNotice("Backup downloaded. Keep it somewhere safe.");
    } catch {
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(STORAGE_KEY);
      } catch {
        onNotice("Device storage is unavailable. Could not export.");
        return;
      }
      if (raw) {
        download(raw, `kharcha-recovery-${localDate()}.json`);
        onNotice("Unreadable saved data downloaded for recovery.");
      } else onNotice("No saved data is available to export.");
    }
  }
  function previewData(value: string, name: string) {
    try {
      const next = parseLedger(value);
      setPreview(next);
      setRaw(value);
      setSelectedName(name);
      setConfirmed(false);
      setError("");
    } catch (e) {
      setPreview(null);
      setRaw("");
      setError((e as Error).message);
    }
  }
  async function loadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      setPreview(null);
      setError("Choose a Kharcha JSON backup smaller than 5 MB.");
      return;
    }
    try {
      previewData(await f.text(), f.name);
    } catch {
      setError("Could not read this backup file.");
    }
    e.target.value = "";
  }
  function restore(e: React.FormEvent) {
    e.preventDefault();
    if (!preview || !confirmed) return;
    try {
      restoreLedger(raw);
      onChange();
      onNotice(
        "Backup restored. The previous device data is kept as a recovery copy.",
      );
      dialog.current?.close();
    } catch (e) {
      setError((e as Error).message || "Restore failed. Check device storage.");
    }
  }
  return (
    <>
      <button onClick={exportData}>
        <Download size={14} /> Export backup
      </button>
      <button onClick={open}>
        <Upload size={14} /> Restore backup
      </button>
      {mounted &&
        createPortal(
          <dialog ref={dialog} aria-labelledby="restore-title">
            <form onSubmit={restore}>
              <div className="modal-header">
                <div>
                  <div className="eyebrow">KEEP YOUR RECORDS SAFE</div>
                  <h2 id="restore-title">Restore a backup</h2>
                </div>
                <button
                  type="button"
                  className="close"
                  aria-label="Close backup restore"
                  onClick={() => dialog.current?.close()}
                >
                  <X />
                </button>
              </div>
              <p className="section-help">
                Restore replaces this device’s records; it does not merge them.
                Export your current backup first. Files stay on this device.
              </p>
              <div className="restore-actions">
                <button type="button" className="outline" onClick={exportData}>
                  <Download size={15} /> Export current data
                </button>
                <button
                  type="button"
                  className="outline"
                  onClick={() => file.current?.click()}
                >
                  <Upload size={15} /> Choose JSON backup
                </button>
              </div>
              <input
                ref={file}
                type="file"
                accept="application/json,.json"
                aria-label="Choose backup file"
                hidden
                onChange={loadFile}
              />
              {recovery && (
                <button
                  type="button"
                  className="outline"
                  onClick={() => {
                    const previous = localStorage.getItem(RECOVERY_KEY);
                    if (previous) previewData(previous, "Previous device data");
                  }}
                >
                  <Undo2 size={15} /> Preview previous device data
                </button>
              )}
              {error && (
                <div className="alert" role="alert">
                  {error}
                </div>
              )}
              {preview && (
                <>
                  <div className="restore-preview">
                    <strong>{selectedName}</strong>
                    <p>
                      {preview.expenses.length} expenses ·{" "}
                      {preview.cards.length} cards · {preview.recurring.length}{" "}
                      schedules
                    </p>
                    <p>
                      {preview.accounts?.length || 0} accounts ·{" "}
                      {preview.entries?.length || 0} income/transfers ·{" "}
                      {preview.plans?.length || 0} budgets
                    </p>
                  </div>
                  <label className="review-check">
                    <input
                      type="checkbox"
                      required
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    I understand this replaces the records on this device.
                  </label>
                  <button className="primary save" disabled={!confirmed}>
                    Replace records & restore
                  </button>
                </>
              )}
            </form>
          </dialog>,
          document.body,
        )}
    </>
  );
}
