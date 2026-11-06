"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatPKR } from "@/lib/utils";

type ChartRow = {
  label: string;
  income: number;
  expenses: number;
  fees: number;
  /** Money received from students. */
  collections?: number;
  payroll?: number;
  outstanding?: number;
  net?: number;
};

function compactAxis(value: number) {
  const amount = Number(value);
  if (Math.abs(amount) >= 1000) return `${Math.round(amount / 1000)}k`;
  return String(amount);
}

const tick = { fontSize: 11, fill: "#a8a29e" };
const chartMargin = { top: 8, right: 8, left: 4, bottom: 4 };

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid #ece6df",
  fontSize: 12,
  boxShadow: "none",
};

function MiniLegend({ items }: { items: Array<{ color: string; label: string }> }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function ChartPanel({
  title,
  legend,
  children,
}: {
  title: string;
  legend?: Array<{ color: string; label: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
        {legend ? <MiniLegend items={legend} /> : null}
      </div>
      <div className="h-44 w-full sm:h-48">{children}</div>
    </div>
  );
}

export function FinanceCharts({
  data,
  compact = false,
}: {
  data: ChartRow[];
  compact?: boolean;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);

  const showExtra = !compact && data.some((row) => row.payroll != null || row.net != null);

  if (!ready) {
    return <div className={`grid gap-8 ${compact ? "xl:grid-cols-2" : "xl:grid-cols-2"}`}>{[1, 2].map((key) => <div key={key} className="h-48 rounded-2xl bg-slate-50" />)}</div>;
  }

  return (
    <div className="grid gap-8 xl:grid-cols-2">
      <ChartPanel
        title="Income vs expenses"
        legend={[
          { color: "#0E7C4A", label: "Income" },
          { color: "#F2914F", label: "Expenses" },
        ]}
      >
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barGap={2} margin={chartMargin}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1ece6" vertical={false} />
            <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
            <YAxis tick={tick} axisLine={false} tickLine={false} width={40} tickFormatter={compactAxis} />
            <Tooltip formatter={(value) => formatPKR(Number(value))} contentStyle={tooltipStyle} />
            <Bar dataKey="income" fill="#0E7C4A" name="Income" radius={[4, 4, 0, 0]} maxBarSize={18} />
            <Bar dataKey="expenses" fill="#F2914F" name="Expenses" radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>
      <ChartPanel
        title={compact ? "Net profit / loss" : "Accrued fee income vs collections"}
        legend={
          compact
            ? [{ color: "#3B6FC0", label: "Net" }]
            : [
                { color: "#3B6FC0", label: "Accrued fee income" },
                { color: "#0E7C4A", label: "Collections" },
              ]
        }
      >
        <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={chartMargin}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1ece6" vertical={false} />
            <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
            <YAxis tick={tick} axisLine={false} tickLine={false} width={40} tickFormatter={compactAxis} />
            <Tooltip formatter={(value) => formatPKR(Number(value))} contentStyle={tooltipStyle} />
            {compact ? (
              <Line type="monotone" dataKey="net" stroke="#3B6FC0" strokeWidth={2} dot={false} />
            ) : (
              <>
                <Line type="monotone" dataKey="fees" name="Accrued fee income" stroke="#3B6FC0" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="collections" name="Collections" stroke="#0E7C4A" strokeWidth={2} dot={false} />
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      </ChartPanel>
      {showExtra ? (
        <>
          <ChartPanel
            title="Payroll & receivables (month end)"
            legend={[
              { color: "#3B6FC0", label: "Payroll" },
              { color: "#F2914F", label: "Accounts Receivable" },
            ]}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} barGap={2} margin={chartMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1ece6" vertical={false} />
                <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
                <YAxis tick={tick} axisLine={false} tickLine={false} width={40} tickFormatter={compactAxis} />
                <Tooltip formatter={(value) => formatPKR(Number(value))} contentStyle={tooltipStyle} />
                <Bar dataKey="payroll" fill="#3B6FC0" radius={[4, 4, 0, 0]} maxBarSize={18} />
                <Bar dataKey="outstanding" fill="#F2914F" radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>
          <ChartPanel title="Net profit / loss" legend={[{ color: "#0E7C4A", label: "Net" }]}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={chartMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1ece6" vertical={false} />
                <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
                <YAxis tick={tick} axisLine={false} tickLine={false} width={40} tickFormatter={compactAxis} />
                <Tooltip formatter={(value) => formatPKR(Number(value))} contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="net" stroke="#0E7C4A" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>
        </>
      ) : null}
    </div>
  );
}
