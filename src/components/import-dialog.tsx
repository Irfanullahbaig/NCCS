"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, FileUp, Upload } from "lucide-react";
import { Button, ErrorText, Select } from "@/components/ui";
import { Modal } from "@/components/forms";
import {
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  IMPORT_SPECS,
  templateRows,
  type ImportPreview,
  type ImportResult,
  type ImportType,
  type PreviewStatus,
} from "@/lib/import/specs";
import { cn, toCsv } from "@/lib/utils";

function downloadCsv(name: string, rows: Array<Array<unknown>>) {
  // BOM so Excel opens Urdu names and "Rs." correctly.
  const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

const baseName = (fileName: string) => fileName.replace(/\.csv$/i, "");

async function send(body: Record<string, string>) {
  const response = await fetch("/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Import failed");
  return data;
}

const STATUS_STYLE: Record<PreviewStatus, { label: string; className: string }> = {
  valid: { label: "Ready", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  invalid: { label: "Error", className: "bg-rose-50 text-rose-700 ring-rose-600/20" },
  duplicate: { label: "Duplicate", className: "bg-amber-50 text-amber-700 ring-amber-600/20" },
};

const OUTCOME_STYLE = {
  imported: { label: "Imported", className: STATUS_STYLE.valid.className },
  duplicate: { label: "Skipped", className: STATUS_STYLE.duplicate.className },
  failed: { label: "Failed", className: STATUS_STYLE.invalid.className },
};

function Pill({ label, className }: { label: string; className: string }) {
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", className)}>{label}</span>;
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: "good" | "bad" | "warn" }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cn("mt-1 text-xl font-bold", tone === "good" ? "text-teal" : tone === "bad" && value ? "text-rose-700" : tone === "warn" && value ? "text-amber-700" : "text-navy")}>
        {value.toLocaleString("en-PK")}
      </p>
    </div>
  );
}

/** "Import" button with template download, server-checked preview, and results. */
export function ImportButton({ types, label = "Import CSV" }: { types: ImportType[]; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ImportType>(types[0]);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [filter, setFilter] = useState<PreviewStatus | "all">("all");
  const [busy, setBusy] = useState<"" | "checking" | "importing">("");
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const spec = IMPORT_SPECS[type];

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setFilter("all");
    setError(null);
    if (input.current) input.current.value = "";
  }

  function close() {
    if (busy === "importing") return;
    if (result?.imported) router.refresh();
    setOpen(false);
    reset();
  }

  async function choose(chosen: File | undefined) {
    setError(null);
    if (!chosen) return;
    if (!/\.csv$/i.test(chosen.name)) return setError("Choose a .csv file. In Excel use File → Save As → CSV UTF-8.");
    if (chosen.size > IMPORT_MAX_BYTES) return setError(`The file is larger than ${Math.round(IMPORT_MAX_BYTES / 1024)} KB. Split it into smaller files.`);
    const text = await chosen.text();
    setFile({ name: chosen.name, text });
    setBusy("checking");
    try {
      const data = await send({ type, mode: "preview", fileName: chosen.name, text });
      setPreview(data.preview);
      setFilter(data.preview.invalid ? "invalid" : "all");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read the file");
    } finally {
      setBusy("");
    }
  }

  async function runImport() {
    if (!file) return;
    setBusy("importing");
    setError(null);
    try {
      const data = await send({ type, mode: "import", fileName: file.name, text: file.text });
      const outcome = data.result as ImportResult;
      setResult(outcome);
      if (outcome.ok) toast.success(`${outcome.imported} record${outcome.imported === 1 ? "" : "s"} imported`);
      else toast.error(outcome.error ?? "Nothing was imported");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import failed");
    } finally {
      setBusy("");
    }
  }

  function downloadInvalid() {
    if (!preview) return;
    const columns = spec.columns;
    const rows = preview.rows.filter((row) => row.status !== "valid");
    downloadCsv(`${baseName(preview.fileName)}-problems.csv`, [
      ["Line", "Status", "Problem", ...columns.map((column) => column.header)],
      ...rows.map((row) => [row.line, STATUS_STYLE[row.status].label, row.messages.join("; "), ...columns.map((column) => row.raw[column.key] ?? "")]),
    ]);
  }

  function downloadSummary() {
    if (!result) return;
    downloadCsv(`${baseName(result.fileName)}-import-summary.csv`, [
      ["Import", spec.label],
      ["File", result.fileName],
      ["Total records", result.total],
      ["Imported", result.imported],
      ["Skipped duplicates", result.duplicates],
      ["Failed", result.failed],
      ...(result.error ? [["Note", result.error]] : []),
      [],
      ["Line", "Outcome", "Record", "Reason"],
      ...result.rows.map((row) => [row.line, OUTCOME_STYLE[row.outcome].label, row.summary, row.reason]),
    ]);
  }

  const shown = preview ? preview.rows.filter((row) => filter === "all" || row.status === filter) : [];
  const canImport = Boolean(preview && !preview.fileErrors.length && preview.valid > 0);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" aria-hidden />
        {label}
      </Button>
      <Modal open={open} onClose={close} title={result ? "Import results" : `Import ${spec.label.toLowerCase()}`}>
        {result ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label="Records processed" value={result.total} />
              <Tile label="Imported" value={result.imported} tone="good" />
              <Tile label="Skipped duplicates" value={result.duplicates} tone="warn" />
              <Tile label="Failed" value={result.failed} tone="bad" />
            </div>
            {result.error ? <ErrorText>{result.error}</ErrorText> : null}
            {result.ok ? (
              <p className="rounded-2xl bg-sage px-4 py-3 text-sm text-teal">
                {result.imported} record{result.imported === 1 ? " was" : "s were"} saved. Totals, balances and reports now include them.
              </p>
            ) : null}
            {result.rows.some((row) => row.outcome !== "imported") ? (
              <RowTable
                rows={result.rows.filter((row) => row.outcome !== "imported").map((row) => ({
                  line: row.line,
                  pill: OUTCOME_STYLE[row.outcome],
                  summary: row.summary,
                  detail: row.reason,
                }))}
              />
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={downloadSummary}>
                <Download className="h-4 w-4" aria-hidden />
                Download summary
              </Button>
              {!result.ok ? <Button variant="outline" onClick={reset}>Try another file</Button> : null}
              <Button onClick={close}>Done</Button>
            </div>
          </div>
        ) : preview ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-navy">{preview.fileName}</span> was checked against the current records. Nothing has been saved yet.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label="Total records" value={preview.total} />
              <Tile label="Ready to import" value={preview.valid} tone="good" />
              <Tile label="With errors" value={preview.invalid} tone="bad" />
              <Tile label="Duplicates" value={preview.duplicates} tone="warn" />
            </div>
            {preview.fileErrors.map((message) => <ErrorText key={message}>{message}</ErrorText>)}
            {preview.unknownColumns.length ? (
              <p className="text-xs text-slate-500">Ignored columns: {preview.unknownColumns.join(", ")}</p>
            ) : null}
            {preview.rows.length ? (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {(["all", "invalid", "duplicate", "valid"] as const).map((value) => {
                    const count = value === "all" ? preview.total : value === "invalid" ? preview.invalid : value === "duplicate" ? preview.duplicates : preview.valid;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setFilter(value)}
                        className={cn("rounded-full px-3 py-1 text-xs font-medium", filter === value ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}
                      >
                        {value === "all" ? "All" : STATUS_STYLE[value].label} ({count})
                      </button>
                    );
                  })}
                </div>
                <RowTable
                  rows={shown.map((row) => ({ line: row.line, pill: STATUS_STYLE[row.status], summary: row.summary, detail: row.messages.join("; ") }))}
                />
              </>
            ) : null}
            {canImport ? (
              <p className="text-xs text-slate-500">
                Only the {preview.valid} ready record{preview.valid === 1 ? "" : "s"} will be saved; rows with errors and duplicates are skipped. If any record fails while saving, the whole import is undone.
              </p>
            ) : null}
            {error ? <ErrorText>{error}</ErrorText> : null}
            <div className="flex flex-wrap justify-end gap-2">
              {preview.invalid + preview.duplicates ? (
                <Button variant="outline" onClick={downloadInvalid}>
                  <Download className="h-4 w-4" aria-hidden />
                  Download problem rows
                </Button>
              ) : null}
              <Button variant="outline" onClick={reset} disabled={busy === "importing"}>Cancel</Button>
              <Button onClick={runImport} disabled={!canImport || busy === "importing"}>
                {busy === "importing" ? "Importing..." : `Import ${preview.valid} record${preview.valid === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {types.length > 1 ? (
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">What are you importing?</span>
                <Select value={type} onChange={(event) => setType(event.target.value as ImportType)}>
                  {types.map((value) => (
                    <option key={value} value={value}>{IMPORT_SPECS[value].label}</option>
                  ))}
                </Select>
              </label>
            ) : null}
            <p className="text-sm text-slate-600">{spec.description}</p>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-navy">Columns</p>
                <Button variant="outline" size="sm" onClick={() => downloadCsv(`nccs-${type}-template.csv`, templateRows(type))}>
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  Download template
                </Button>
              </div>
              <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-xs text-slate-600 sm:grid-cols-2">
                {spec.columns.map((column) => (
                  <li key={column.key}>
                    <span className="font-medium text-navy">{column.header}</span>
                    {column.required ? <span className="text-rose-600"> *</span> : null}
                    <span className="text-slate-500"> — {column.help}</span>
                  </li>
                ))}
              </ul>
            </div>
            <label
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 px-4 py-8 text-center hover:border-teal hover:bg-sage/40",
                busy && "pointer-events-none opacity-60",
              )}
            >
              <FileUp className="h-6 w-6 text-teal" aria-hidden />
              <span className="text-sm font-semibold text-navy">{busy === "checking" ? "Checking the file..." : "Choose a CSV file"}</span>
              <span className="text-xs text-slate-500">
                Up to {Math.round(IMPORT_MAX_BYTES / 1024)} KB and {IMPORT_MAX_ROWS.toLocaleString("en-PK")} rows. You will see a preview before anything is saved.
              </span>
              <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => choose(event.target.files?.[0])} />
            </label>
            {error ? <ErrorText>{error}</ErrorText> : null}
          </div>
        )}
      </Modal>
    </>
  );
}

function RowTable({ rows }: { rows: Array<{ line: number; pill: { label: string; className: string }; summary: string; detail: string }> }) {
  if (!rows.length) return <p className="text-sm text-slate-500">No rows in this view.</p>;
  return (
    <div className="max-h-80 overflow-auto rounded-2xl border border-slate-100">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">Line</th>
            <th className="px-3 py-2 font-medium">Record</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.line} className="border-t border-slate-100 align-top">
              <td className="px-3 py-2 text-slate-500">{row.line}</td>
              <td className="px-3 py-2 font-medium text-navy">{row.summary}</td>
              <td className="px-3 py-2"><Pill {...row.pill} /></td>
              <td className="px-3 py-2 text-xs text-slate-600">{row.detail || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
