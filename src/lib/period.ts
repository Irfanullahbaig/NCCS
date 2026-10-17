import { parseDateInput, monthLabel, currentMonthYear } from "@/lib/utils";

export type PeriodMode = "month" | "year" | "custom";

export type ResolvedPeriod = {
  mode: PeriodMode;
  year: number;
  month: number | null;
  from: Date;
  to: Date;
  label: string;
};

export function periodFromParams(params: Record<string, string | undefined>): ResolvedPeriod {
  const now = new Date();
  const fallback = currentMonthYear(now);
  const year = Number(params.year) || fallback.year;
  const month = Number(params.month) || fallback.month;
  const mode = (params.period as PeriodMode | undefined) ?? (params.from && params.to ? "custom" : params.year && !params.month && params.period === "year" ? "year" : "month");

  if (mode === "year") {
    return {
      mode: "year",
      year,
      month: null,
      from: new Date(year, 0, 1, 0, 0, 0),
      to: new Date(year, 11, 31, 23, 59, 59),
      label: String(year),
    };
  }
  if (mode === "custom" && params.from && params.to) {
    const from = parseDateInput(params.from);
    const to = parseDateInput(params.to);
    to.setHours(23, 59, 59, 999);
    return { mode: "custom", year, month: null, from, to, label: `${params.from} to ${params.to}` };
  }
  return {
    mode: "month",
    year,
    month,
    from: new Date(year, month - 1, 1, 0, 0, 0),
    to: new Date(year, month, 0, 23, 59, 59),
    label: monthLabel(month, year),
  };
}

export function isoRange(period: ResolvedPeriod) {
  const fmt = (value: Date) => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  return { from: fmt(period.from), to: fmt(period.to) };
}
