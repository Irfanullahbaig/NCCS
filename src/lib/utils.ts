import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const PK_TIMEZONE = "Asia/Karachi";

export function formatPKR(amount: number | null | undefined) {
  const value = Math.round(Number(amount ?? 0));
  const sign = value < 0 ? "-" : "";
  const grouped = Math.abs(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `Rs. ${sign}${grouped}`;
}

export function formatDate(value: Date | string | null | undefined) {
  if (value == null || value === "") return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: PK_TIMEZONE,
  }).format(date);
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (value == null || value === "") return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: PK_TIMEZONE,
  }).format(date);
}

export function fullName(first: string, last: string) {
  return `${first} ${last}`.trim();
}

export function monthLabel(month: number, year: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function toDateInput(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}

export function parseDateInput(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

export function currentMonthYear(date = new Date()) {
  return { month: date.getMonth() + 1, year: date.getFullYear() };
}

export function lastDayOfMonth(year: number, month: number) {
  return new Date(year, month, 0, 23, 59, 59);
}

export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function csvEscape(value: unknown) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(rows: Array<Array<unknown>>) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}
