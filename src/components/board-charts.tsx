"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { cn, formatPKR } from "@/lib/utils";

/*
 * Series colours, checked for colour-blind separation on white:
 * green and orange differ in lightness as well as hue, so they stay apart for
 * red-green colour blindness. Orange is below 3:1 contrast, so every chart
 * also shows its totals as text in the legend.
 */
export const SERIES = { green: "#0E7C4A", orange: "#F2914F", blue: "#3B6FC0" } as const;

const tick = { fontSize: 11, fill: "#a8a29e" };
const grid = "#f1ece6";

function useMounted() {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}

function compact(value: number) {
  const amount = Math.abs(Number(value));
  const sign = Number(value) < 0 ? "-" : "";
  if (amount >= 1_000_000) return `${sign}${Math.round(amount / 100_000) / 10}M`;
  if (amount >= 1000) return `${sign}${Math.round(amount / 1000)}k`;
  return `${sign}${amount}`;
}

function ChartTooltip({ active, payload, label, money = true }: Partial<TooltipContentProps<number, string>> & { money?: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-navy px-3 py-2 text-xs text-white shadow-lg">
      <p className="mb-1 font-semibold">{label}</p>
      {payload.map((entry) => (
        <p key={String(entry.dataKey)} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-white/70">{entry.name}</span>
          <span className="ml-auto pl-3 font-semibold">{money ? formatPKR(Number(entry.value)) : Number(entry.value)}</span>
        </p>
      ))}
    </div>
  );
}

function Legend({ items }: { items: Array<{ color: string; label: string; value?: string }> }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
          <span className="text-xs text-slate-500">{item.label}</span>
          {item.value ? <span className="text-sm font-semibold text-navy">{item.value}</span> : null}
        </div>
      ))}
    </div>
  );
}

function Placeholder({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-2xl bg-slate-50", className)} />;
}

function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: Array<{ value: T; label: string }> }) {
  return (
    <div className="inline-flex rounded-2xl bg-slate-100 p-1" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-xl px-3 py-1.5 text-xs font-semibold transition sm:text-sm",
            value === option.value ? "bg-gold text-white shadow-sm" : "text-slate-600 hover:text-navy",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

type MoneyRow = { label: string; income: number; expenses: number; net: number };
type FeeRow = { label: string; collected: number; outstanding: number };

/** Income vs expenses and fee collection for the year, switchable by tab. */
export function FinanceTrendChart({ money, fees, year, showMoney }: { money: MoneyRow[]; fees: FeeRow[]; year: number; showMoney: boolean }) {
  const mounted = useMounted();
  const [view, setView] = useState<"money" | "fees">(showMoney ? "money" : "fees");
  const total = (rows: ReadonlyArray<object>, key: string) => rows.reduce((sum, row) => sum + Number((row as Record<string, unknown>)[key] ?? 0), 0);
  const empty = view === "money" ? !money.some((row) => row.income || row.expenses) : !fees.some((row) => row.collected || row.outstanding);

  const legend =
    view === "money"
      ? [
          { color: SERIES.green, label: "Income", value: formatPKR(total(money, "income")) },
          { color: SERIES.orange, label: "Expenses", value: formatPKR(total(money, "expenses")) },
        ]
      : [
          { color: SERIES.green, label: "Collected", value: formatPKR(total(fees, "collected")) },
          { color: SERIES.orange, label: "Outstanding", value: formatPKR(total(fees, "outstanding")) },
        ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-navy">Financial analytics</h2>
          <p className="text-xs text-slate-500">
            {view === "money" ? `Monthly income and expenses, ${year}` : `Fees collected and still owed by fee month, ${year}`}
          </p>
        </div>
        {showMoney ? (
          <Tabs
            value={view}
            onChange={setView}
            options={[
              { value: "money", label: "Income & expenses" },
              { value: "fees", label: "Fee collection" },
            ]}
          />
        ) : null}
      </div>
      <div className="mt-4">
        <Legend items={legend} />
      </div>
      <div className="mt-3 h-64 sm:h-72">
        {!mounted ? (
          <Placeholder className="h-full" />
        ) : empty ? (
          <div className="flex h-full items-center justify-center rounded-2xl bg-slate-50 text-sm text-slate-500">No records for {year} yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={(view === "money" ? money : fees) as Array<Record<string, number | string>>} barGap={2} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
              <YAxis tick={tick} axisLine={false} tickLine={false} width={44} tickFormatter={compact} />
              <Tooltip cursor={{ fill: "rgba(224,123,69,0.08)", radius: 8 }} content={<ChartTooltip />} />
              {view === "money" ? (
                <>
                  <Bar dataKey="income" name="Income" fill={SERIES.green} radius={[4, 4, 0, 0]} maxBarSize={16} />
                  <Bar dataKey="expenses" name="Expenses" fill={SERIES.orange} radius={[4, 4, 0, 0]} maxBarSize={16} />
                </>
              ) : (
                <>
                  <Bar dataKey="collected" name="Collected" stackId="fees" fill={SERIES.green} maxBarSize={22} />
                  <Bar dataKey="outstanding" name="Outstanding" stackId="fees" fill={SERIES.orange} radius={[4, 4, 0, 0]} maxBarSize={22} />
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

type LedgerMonth = {
  label: string;
  accrued: number;
  income: number;
  collections: number;
  expenses: number;
  receivable: number;
  vouchersPaid: number;
  vouchersPartial: number;
  vouchersUnpaid: number;
  collectionRate: number | null;
};
const RECEIVABLE_COLOR = "#1f2622";
type LedgerView = "accrual" | "vouchers" | "rate";

/**
 * Accounting analytics from the journal, by tab: accrued fee income against
 * collections with Accounts Receivable at each month end; fee vouchers by
 * status; and the share of each month's vouchers collected so far.
 */
export function LedgerTrendChart({ months, year, receivableNow }: { months: LedgerMonth[]; year: number; receivableNow: number }) {
  const mounted = useMounted();
  const [view, setView] = useState<LedgerView>("accrual");
  const sum = (key: "accrued" | "collections" | "vouchersPaid" | "vouchersPartial" | "vouchersUnpaid") => months.reduce((total, row) => total + row[key], 0);
  const rates = months.filter((row) => row.collectionRate !== null);
  const empty =
    view === "accrual"
      ? !months.some((row) => row.accrued || row.collections || row.receivable)
      : view === "vouchers"
        ? !months.some((row) => row.vouchersPaid || row.vouchersPartial || row.vouchersUnpaid)
        : !rates.length;
  const subtitle = {
    accrual: `Fee income accrued when vouchers are issued, against payments collected, each month of ${year}, with Accounts Receivable at month end.`,
    vouchers: `Fee vouchers for each month of ${year} by payment status.`,
    rate: `Share of each fee month's vouchers collected so far, ${year}.`,
  }[view];
  const legend =
    view === "accrual"
      ? [
          { color: SERIES.green, label: "Accrued fee income", value: formatPKR(sum("accrued")) },
          { color: SERIES.blue, label: "Collections", value: formatPKR(sum("collections")) },
          { color: RECEIVABLE_COLOR, label: "Receivables now", value: formatPKR(receivableNow) },
        ]
      : view === "vouchers"
        ? [
            { color: SERIES.green, label: "Paid", value: String(sum("vouchersPaid")) },
            { color: SERIES.blue, label: "Partially paid", value: String(sum("vouchersPartial")) },
            { color: SERIES.orange, label: "Unpaid", value: String(sum("vouchersUnpaid")) },
          ]
        : [
            {
              color: SERIES.green,
              label: "Latest month",
              value: rates.length ? `${rates[rates.length - 1].collectionRate}%` : "—",
            },
          ];
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-navy">Accounting analytics</h2>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        <Tabs
          value={view}
          onChange={setView}
          options={[
            { value: "accrual", label: "Income vs collections" },
            { value: "vouchers", label: "Paid vs unpaid" },
            { value: "rate", label: "Collection trend" },
          ]}
        />
      </div>
      <div className="mt-4">
        <Legend items={legend} />
      </div>
      <div className="mt-3 h-64 sm:h-72">
        {!mounted ? (
          <Placeholder className="h-full" />
        ) : empty ? (
          <div className="flex h-full items-center justify-center rounded-2xl bg-slate-50 text-sm text-slate-500">No records for {year} yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={months} barGap={2} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
              {view === "accrual" ? (
                <>
                  <YAxis tick={tick} axisLine={false} tickLine={false} width={44} tickFormatter={compact} />
                  <Tooltip cursor={{ fill: "rgba(224,123,69,0.08)", radius: 8 }} content={<ChartTooltip />} />
                  <Bar dataKey="accrued" name="Accrued fee income" fill={SERIES.green} radius={[4, 4, 0, 0]} maxBarSize={16} />
                  <Bar dataKey="collections" name="Collections" fill={SERIES.blue} radius={[4, 4, 0, 0]} maxBarSize={16} />
                  <Line dataKey="receivable" name="Receivables (month end)" type="monotone" stroke={RECEIVABLE_COLOR} strokeWidth={2} dot={{ r: 2.5 }} />
                </>
              ) : view === "vouchers" ? (
                <>
                  <YAxis tick={tick} axisLine={false} tickLine={false} width={44} allowDecimals={false} />
                  <Tooltip cursor={{ fill: "rgba(224,123,69,0.08)", radius: 8 }} content={<ChartTooltip money={false} />} />
                  <Bar dataKey="vouchersPaid" name="Paid" stackId="v" fill={SERIES.green} maxBarSize={22} />
                  <Bar dataKey="vouchersPartial" name="Partially paid" stackId="v" fill={SERIES.blue} maxBarSize={22} />
                  <Bar dataKey="vouchersUnpaid" name="Unpaid" stackId="v" fill={SERIES.orange} radius={[4, 4, 0, 0]} maxBarSize={22} />
                </>
              ) : (
                <>
                  <YAxis tick={tick} axisLine={false} tickLine={false} width={44} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                  <Tooltip cursor={{ stroke: grid }} content={<ChartTooltip money={false} />} />
                  <Line dataKey="collectionRate" name="Collected (%)" type="monotone" stroke={SERIES.green} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/** New admissions per month over the last 12 months. */
export function EnrollmentChart({ data, total }: { data: Array<{ label: string; admitted: number }>; total: number }) {
  const mounted = useMounted();
  const admitted = data.reduce((sum, row) => sum + row.admitted, 0);
  return (
    <ChartFrame
      title="Enrollment trend"
      subtitle="New admissions per month, last 12 months"
      legend={<Legend items={[{ color: SERIES.green, label: "Admitted", value: String(admitted) }, { color: "#d6d0c9", label: "Active now", value: String(total) }]} />}
    >
      {!mounted ? (
        <Placeholder className="h-full" />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 4, left: -18, bottom: 0 }}>
            <CartesianGrid stroke={grid} vertical={false} />
            <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={tick} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
            <Tooltip cursor={{ fill: "rgba(14,124,74,0.06)", radius: 8 }} content={<ChartTooltip money={false} />} />
            <Bar dataKey="admitted" name="Admitted" fill={SERIES.green} radius={[4, 4, 0, 0]} maxBarSize={22}>
              <LabelList dataKey="admitted" position="top" fontSize={10} fill="#78716c" formatter={(value) => (Number(value) ? String(value) : "")} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  );
}

/** Students per class, largest first. One hue: the bar length carries the value. */
export function ClassDistributionChart({ data }: { data: Array<{ name: string; students: number }> }) {
  const mounted = useMounted();
  const rows = data.slice(0, 8);
  return (
    <ChartFrame title="Class-wise students" subtitle={data.length > 8 ? `Top 8 of ${data.length} classes` : "Active students in each class"}>
      {!mounted ? (
        <Placeholder className="h-full" />
      ) : !rows.length ? (
        <div className="flex h-full items-center justify-center rounded-2xl bg-slate-50 text-sm text-slate-500">No active classes yet.</div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 28, left: 0, bottom: 0 }} barCategoryGap={6}>
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis type="category" dataKey="name" tick={{ ...tick, fill: "#57534e" }} axisLine={false} tickLine={false} width={112} />
            <Tooltip cursor={{ fill: "rgba(14,124,74,0.06)" }} content={<ChartTooltip money={false} />} />
            <Bar dataKey="students" name="Students" radius={[0, 4, 4, 0]} maxBarSize={16}>
              {rows.map((row, index) => (
                <Cell key={row.name} fill={SERIES.green} fillOpacity={1 - index * 0.06} />
              ))}
              <LabelList dataKey="students" position="right" fontSize={11} fill="#44403c" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  );
}

function ChartFrame({ title, subtitle, legend, children }: { title: string; subtitle: string; legend?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-navy">{title}</h2>
      <p className="text-xs text-slate-500">{subtitle}</p>
      {legend ? <div className="mt-3">{legend}</div> : null}
      <div className="mt-3 h-56">{children}</div>
    </div>
  );
}
