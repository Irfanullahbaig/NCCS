import { IMPORT_SPECS, type ImportType } from "@/lib/import/specs";

/** CSV reading and value parsing for imports. Safe to import from client components. */

/** RFC 4180 style: quoted fields, doubled quotes, commas and line breaks inside quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field === "") quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Maps each file column to a spec key using the header text (case, spaces and punctuation ignored). */
export function readImportRows(type: ImportType, text: string) {
  const spec = IMPORT_SPECS[type];
  const all = parseCsv(text);
  const lines = all
    .map((cells, index) => ({ cells, line: index + 1 }))
    .filter(({ cells }) => cells.some((cell) => cell.trim() !== ""));
  const header = lines.shift();
  if (!header) return { rows: [], missing: spec.columns.filter((column) => column.required).map((column) => column.header), unknown: [] as string[], duplicateHeaders: [] as string[] };

  const lookup = new Map<string, string>();
  for (const column of spec.columns) {
    for (const name of [column.header, column.key, ...(column.aliases ?? [])]) lookup.set(normalize(name), column.key);
  }
  const keys = header.cells.map((cell) => lookup.get(normalize(cell)) ?? null);
  const unknown = header.cells.filter((cell, index) => cell.trim() && !keys[index]);
  const seen = new Set<string>();
  const duplicateHeaders: string[] = [];
  keys.forEach((key, index) => {
    if (!key) return;
    if (seen.has(key)) duplicateHeaders.push(header.cells[index]);
    seen.add(key);
  });
  const missing = spec.columns.filter((column) => column.required && !seen.has(column.key)).map((column) => column.header);

  const rows = lines.map(({ cells, line }) => {
    const raw: Record<string, string> = {};
    keys.forEach((key, index) => {
      if (key && raw[key] === undefined) raw[key] = (cells[index] ?? "").trim();
    });
    return { line, raw };
  });
  return { rows, missing, unknown, duplicateHeaders };
}

// ---------------------------------------------------------------- Value parsing

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** Accepts YYYY-MM-DD, DD/MM/YYYY and DD-MM-YYYY. Returns YYYY-MM-DD or null. */
export function parseDateValue(value: string): string | null {
  const text = value.trim();
  let year: number, month: number, day: number;
  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  if (year < 1950 || year > 2100) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseMonthValue(value: string): number | null {
  const text = value.trim().toLowerCase();
  if (/^\d{1,2}$/.test(text)) {
    const month = Number(text);
    return month >= 1 && month <= 12 ? month : null;
  }
  const index = MONTHS.findIndex((name) => name === text || name.slice(0, 3) === text);
  return index >= 0 ? index + 1 : null;
}

/** Whole rupees. Accepts "5,000", "Rs. 5000" and "5000.00". */
export function parseAmountValue(value: string): number | null {
  const text = value.trim().replace(/^rs\.?\s*/i, "").replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const amount = Number(text);
  return Number.isFinite(amount) ? Math.round(amount) : null;
}

/** Matches a value against an enum by code ("BANK_TRANSFER") or label ("Bank Transfer"). */
export function parseEnumValue<T extends string>(value: string, labels: Record<T, string>): T | null {
  const text = normalize(value);
  if (!text) return null;
  for (const [code, label] of Object.entries(labels) as Array<[T, string]>) {
    if (normalize(code) === text || normalize(label) === text) return code;
  }
  return null;
}
