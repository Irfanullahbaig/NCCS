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
import { readImportRows } from "@/lib/import/csv";
import { IMPORT_ACCEPT, IMPORT_EXTENSIONS, IMPORT_FORMATS, IMPORT_MAX_FILE_BYTES, fileExtension, readImportFile, type ImportSheet } from "@/lib/import/files";
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

async function downloadXlsx(name: string, rows: Array<Array<unknown>>) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Import");
  XLSX.writeFile(workbook, name);
}

const baseName = (fileName: string) => fileName.replace(/\.[a-z0-9]+$/i, "");

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
export function ImportButton({ types, label = "Import" }: { types: ImportType[]; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ImportType>(types[0]);
  const [file, setFile] = useState<{ name: string; sheets: ImportSheet[]; sheet: number } | null>(null);
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
    if (!IMPORT_EXTENSIONS.includes(fileExtension(chosen.name))) {
      return setError("This file type cannot be imported. Choose a CSV, Excel, OpenDocument, PDF or tab-separated text file.");
    }
    const limit = fileExtension(chosen.name) === "csv" ? IMPORT_MAX_BYTES : IMPORT_MAX_FILE_BYTES;
    if (chosen.size > limit) return setError(`The file is larger than ${formatBytes(limit)}. Split it into smaller files.`);
    setBusy("checking");
    try {
      const sheets = await readImportFile(chosen, (cells) => headerScore(type, toCsv([cells])));
      await check({ name: chosen.name, sheets, sheet: bestSheet(type, sheets) });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read the file");
      if (input.current) input.current.value = "";
    } finally {
      setBusy("");
    }
  }

  /** Server-side preview of one sheet. */
  async function check(next: { name: string; sheets: ImportSheet[]; sheet: number }) {
    const { csv } = next.sheets[next.sheet];
    if (new Blob([csv]).size > IMPORT_MAX_BYTES) throw new Error(`The data is larger than ${formatBytes(IMPORT_MAX_BYTES)}. Split it into smaller files.`);
    const data = await send({ type, mode: "preview", fileName: next.name, text: csv });
    setFile(next);
    setPreview(data.preview);
    setFilter(data.preview.invalid ? "invalid" : "all");
  }

  async function chooseSheet(index: number) {
    if (!file) return;
    setBusy("checking");
    setError(null);
    try {
      await check({ ...file, sheet: index });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read the sheet");
    } finally {
      setBusy("");
    }
  }

  async function runImport() {
    if (!file) return;
    setBusy("importing");
    setError(null);
    try {
      const data = await send({ type, mode: "import", fileName: file.name, text: file.sheets[file.sheet].csv });
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
            {file && file.sheets.length > 1 ? (
              <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                <span className="font-medium">Sheet</span>
                <Select value={String(file.sheet)} disabled={Boolean(busy)} onChange={(event) => chooseSheet(Number(event.target.value))} className="w-auto">
                  {file.sheets.map((entry, index) => (
                    <option key={entry.name} value={index}>{entry.name} ({entry.rows} row{entry.rows === 1 ? "" : "s"})</option>
                  ))}
                </Select>
              </label>
            ) : null}
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
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => downloadXlsx(`nccs-${type}-template.xlsx`, templateRows(type))}>
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    Excel template
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => downloadCsv(`nccs-${type}-template.csv`, templateRows(type))}>
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    CSV template
                  </Button>
                </div>
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
              <span className="text-sm font-semibold text-navy">{busy === "checking" ? "Reading the file..." : "Choose a file"}</span>
              <span className="text-xs text-slate-500">
                {IMPORT_FORMATS.map((format) => `${format.label} (${format.extensions.map((extension) => `.${extension}`).join(", ")})`).join(" · ")}
              </span>
              <span className="text-xs text-slate-500">
                Up to {formatBytes(IMPORT_MAX_FILE_BYTES)} and {IMPORT_MAX_ROWS.toLocaleString("en-PK")} rows. PDFs must contain a text table, not a scan. You will see a preview before anything is saved.
              </span>
              <input ref={input} type="file" accept={IMPORT_ACCEPT} className="sr-only" onChange={(event) => choose(event.target.files?.[0])} />
            </label>
            {error ? <ErrorText>{error}</ErrorText> : null}
          </div>
        )}
      </Modal>
    </>
  );
}

/** The sheet whose headers match the most expected columns (a workbook may start with a notes sheet). */
function bestSheet(type: ImportType, sheets: ImportSheet[]) {
  const score = (entry: ImportSheet) => headerScore(type, entry.csv.split(/\r?\n/, 1)[0]);
  return sheets.reduce((best, entry, index) => (score(entry) > score(sheets[best]) ? index : best), 0);
}

/** Higher when a header line has more of the expected columns and fewer unknown ones. */
function headerScore(type: ImportType, headerLine: string) {
  const { missing, unknown } = readImportRows(type, headerLine);
  return -missing.length * 100 - unknown.length;
}

function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024 ? `${Math.round(bytes / 1024 / 1024)} MB` : `${Math.round(bytes / 1024)} KB`;
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
