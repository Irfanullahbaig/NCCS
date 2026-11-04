import { toCsv } from "@/lib/utils";

/**
 * Turns an uploaded file into CSV text in the browser. The server then checks every row exactly as it
 * does for a CSV upload, so a spreadsheet or PDF never gets past the import checks.
 */

export const IMPORT_FORMATS = [
  { label: "CSV", extensions: ["csv"] },
  { label: "Excel", extensions: ["xlsx", "xlsm", "xls"] },
  { label: "OpenDocument", extensions: ["ods"] },
  { label: "PDF", extensions: ["pdf"] },
  { label: "Tab-separated text", extensions: ["tsv", "txt"] },
] as const;

export const IMPORT_EXTENSIONS: string[] = IMPORT_FORMATS.flatMap((format) => [...format.extensions]);
export const IMPORT_ACCEPT = IMPORT_EXTENSIONS.map((extension) => `.${extension}`).join(",");
/** Spreadsheets and PDFs are larger than the CSV they hold; the CSV sent to the server keeps its own limit. */
export const IMPORT_MAX_FILE_BYTES = 8 * 1024 * 1024;

export type ImportSheet = { name: string; csv: string; rows: number };

export const fileExtension = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";

/** Rates how much a row looks like the header of the expected table; the PDF reader uses it to find the table. */
export type HeaderScore = (cells: string[]) => number;

export async function readImportFile(file: File, scoreHeader: HeaderScore = (cells) => cells.length): Promise<ImportSheet[]> {
  const extension = fileExtension(file.name);
  if (extension === "csv") return [sheet("CSV", null, await file.text())];
  if (extension === "tsv" || extension === "txt") return [sheet("Text", splitDelimited(await file.text()))];
  if (extension === "pdf") return readPdf(file, scoreHeader);
  if (["xlsx", "xlsm", "xls", "ods"].includes(extension)) return readWorkbook(file);
  throw new Error(`.${extension || "?"} files cannot be imported. Use a CSV, Excel, OpenDocument, PDF or tab-separated text file.`);
}

function sheet(name: string, rows: string[][] | null, csv?: string): ImportSheet {
  const text = csv ?? toCsv(rows ?? []);
  const count = rows ? rows.filter((row) => row.some((cell) => cell.trim())).length : text.split(/\r?\n/).filter((line) => line.trim()).length;
  return { name, csv: text, rows: Math.max(count - 1, 0) };
}

/** Tab-separated, or semicolon/pipe separated when the first line has no tabs. Simple quoting only. */
function splitDelimited(text: string) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const first = lines.find((line) => line.trim()) ?? "";
  const delimiter = first.includes("\t") ? "\t" : first.includes(";") ? ";" : first.includes("|") ? "|" : ",";
  return lines.map((line) => line.split(delimiter).map((cell) => cell.trim().replace(/^"(.*)"$/, "$1").replace(/""/g, '"')));
}

// ---------------------------------------------------------------- Excel and OpenDocument

async function readWorkbook(file: File): Promise<ImportSheet[]> {
  const XLSX = await import("xlsx");
  let workbook;
  try {
    workbook = XLSX.read(await file.arrayBuffer(), { cellDates: true, dense: true });
  } catch {
    throw new Error("The spreadsheet could not be opened. It may be damaged or password protected.");
  }
  const sheets = workbook.SheetNames.map((name) => {
    const worksheet = workbook.Sheets[name];
    // Date cells keep their local display ("9/1/26"); give them one unambiguous format instead.
    for (const row of worksheet["!data"] ?? []) {
      for (const cell of row ?? []) {
        if (cell?.t !== "d") continue;
        cell.z = "yyyy-mm-dd";
        delete cell.w;
      }
    }
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: false, defval: "", blankrows: false });
    return sheet(name, rows.map((row) => row.map((cell) => String(cell ?? "").trim())));
  }).filter((entry) => entry.rows > 0);
  if (!sheets.length) throw new Error("The spreadsheet has no rows below a header row.");
  return sheets;
}

// ---------------------------------------------------------------- PDF

type PdfWord = { text: string; x: number; right: number; y: number; size: number };

/**
 * Reads tables from a text PDF (one exported from Excel, Word or this app). Words on the same line become
 * a row; each word goes to the header column it lines up with. Scanned PDFs have no text to read.
 */
async function readPdf(file: File, scoreHeader: HeaderScore): Promise<ImportSheet[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  let document;
  try {
    document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  } catch {
    throw new Error("The PDF could not be opened. It may be damaged or password protected.");
  }

  const lines: PdfWord[][] = [];
  for (let page = 1; page <= document.numPages; page += 1) {
    const content = await (await document.getPage(page)).getTextContent();
    const words: PdfWord[] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const [scale, , , , x, y] = item.transform as number[];
      words.push({ text: item.str.trim(), x, right: x + item.width, y, size: Math.abs(scale) || 10 });
    }
    // Top of the page first; words within 3pt vertically share a line.
    words.sort((a, b) => b.y - a.y || a.x - b.x);
    const pageLines: PdfWord[][] = [];
    for (const word of words) {
      const line = pageLines[pageLines.length - 1];
      if (line && Math.abs(line[0].y - word.y) <= 3) line.push(word);
      else pageLines.push([word]);
    }
    lines.push(...pageLines.map((line) => line.sort((a, b) => a.x - b.x)));
  }
  await document.loadingTask.destroy();
  if (!lines.length) throw new Error("No text was found in the PDF. Scanned PDFs cannot be read; export the table to Excel or CSV instead.");

  // Find the header: one to three stacked lines among the first few that best match the expected column names.
  let headerStart = 0;
  let headerLines = 1;
  let header: PdfWord[] = [];
  let bestScore = -Infinity;
  for (let start = 0; start < Math.min(lines.length, 20); start += 1) {
    for (let count = 1; count <= 3 && start + count <= lines.length; count += 1) {
      const candidate = headerColumns(lines.slice(start, start + count));
      const score = scoreHeader(candidate.map((word) => word.text));
      if (score > bestScore) [bestScore, headerStart, headerLines, header] = [score, start, count, candidate];
    }
  }
  if (header.length < 2) throw new Error("No table was found in the PDF. Export the table to Excel or CSV instead.");
  const columns = header.map((word) => ({ name: word.text, x: word.x, right: word.right }));
  const headerText = new Set(lines.slice(headerStart, headerStart + headerLines).map((line) => line.map((word) => word.text).join(" ")));

  const rows: string[][] = [columns.map((column) => column.name)];
  for (const line of lines.slice(headerStart + headerLines)) {
    // Repeated headers on later pages are skipped.
    if (headerText.has(line.map((word) => word.text).join(" "))) continue;
    const cells = columns.map(() => [] as string[]);
    for (const word of line) {
      const centre = (word.x + word.right) / 2;
      let best = 0;
      let bestDistance = Infinity;
      columns.forEach((column, index) => {
        const inside = centre >= column.x - 4 && centre <= column.right + 4;
        const distance = inside ? 0 : Math.min(Math.abs(word.x - column.x), Math.abs(word.right - column.right), Math.abs(centre - (column.x + column.right) / 2));
        if (distance < bestDistance) [best, bestDistance] = [index, distance];
      });
      cells[best].push(word.text);
    }
    // Lines with a single word (titles, page numbers, footers) are not table rows.
    if (cells.filter((cell) => cell.length).length < 2) continue;
    rows.push(cells.map((cell) => cell.join(" ")));
  }
  if (rows.length < 2) throw new Error("No table rows were found in the PDF. Export the table to Excel or CSV instead.");
  return [sheet("PDF", rows)];
}

/**
 * Joins header words into columns. Words stacked above each other ("Fee" over "Month") or a space apart
 * on one line ("Registration No") belong to the same heading; columns are further apart.
 */
function headerColumns(lines: PdfWord[][]) {
  const columns: Array<PdfWord & { line: number }> = [];
  lines.forEach((line, lineIndex) => {
    for (const word of line) {
      const column = columns.find(
        (entry) =>
          (entry.line !== lineIndex && word.x < entry.right + 2 && word.right > entry.x - 2) ||
          (entry.line === lineIndex && word.x >= entry.right && word.x - entry.right < word.size * 0.6),
      );
      if (column) Object.assign(column, { text: `${column.text} ${word.text}`, x: Math.min(column.x, word.x), right: Math.max(column.right, word.right), line: lineIndex });
      else columns.push({ ...word, line: lineIndex });
    }
  });
  return columns.sort((a, b) => a.x - b.x);
}
