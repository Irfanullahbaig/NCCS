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
  payroll?: number;
  outstanding?: number;
  net?: number;
};

function compactAxis(value: number) {
  const amount = Number(value);
  if (Math.abs(amount) >= 1000) return `${Math.round(amount / 1000)}k`;
  return String(amount);
}

const tick = { fontSize: 11, fill: "#94a3b8" };
const chartMargin = { top: 8, right: 8, left: 4, bottom: 4 };

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid #e6ebf2",
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
    return <div className={`grid gap-8 ${compact ? "xl:grid-cols-2" : "xl:grid-cols-2"}`}>{[1, 2].map((key) => <div key={key} className="h-48 rounded-xl bg-slate-50" />)}</div>;
  }

  return (
    <div className="grid gap-8 xl:grid-cols-2">
      <ChartPanel
        title="Income vs expenses"
        legend={[
          { color: "#0f766e", label: "Income" },
          { color: "#e11d48", label: "Expenses" },
        ]}
      >
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barGap={2} margin={chartMargin}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
            <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
            <YAxis tick={tick} axisLine={false} tickLine={false} width={40} tickFormatter={compactAxis} />
            <Tooltip formatter={(value) => formatPKR(Number(value))} contentStyle={tooltipStyle} />
            <Bar dataKey="income" fill="#0f766e" name="Income" radius={[4, 4, 0, 0]} maxBarSize={18} />
            <Bar dataKey="expenses" fill="#e11d48" name="Expenses" radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>
      <ChartPanel
        title={compact ? "Net profit / loss" : "Fee collection"}
        legend={
          compact
            ? [{ color: "#1a3b66", label: "Net" }]
            : [
                { color: "#1a3b66", label: "Student fees" },
                { color: "#14b8a6", label: "Total income" },
              ]
        }
      >
        <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={chartMargin}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
            <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
            <YAxis tick={tick} axisLine={false} tickLine={false} width={40} tickFormatter={compactAxis} />
            <Tooltip formatter={(value) => formatPKR(Number(value))} contentStyle={tooltipStyle} />
            {compact ? (
              <Line type="monotone" dataKey="net" stroke="#1a3b66" strokeWidth={2} dot={false} />
            ) : (
              <>
                <Line type="monotone" dataKey="fees" stroke="#1a3b66" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="income" stroke="#14b8a6" strokeWidth={2} dot={false} />
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      </ChartPanel>
      {showExtra ? (
        <>
          <ChartPanel
            title="Payroll & outstanding"
            legend={[
              { color: "#1a3b66", label: "Payroll" },
              { color: "#d97706", label: "Outstanding" },
            ]}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} barGap={2} margin={chartMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
                <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
                <YAxis tick={tick} axisLine={false} tickLine={false} width={40} tickFormatter={compactAxis} />
                <Tooltip formatter={(value) => formatPKR(Number(value))} contentStyle={tooltipStyle} />
                <Bar dataKey="payroll" fill="#1a3b66" radius={[4, 4, 0, 0]} maxBarSize={18} />
                <Bar dataKey="outstanding" fill="#d97706" radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>
          <ChartPanel title="Net profit / loss" legend={[{ color: "#0f766e", label: "Net" }]}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={chartMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
                <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
                <YAxis tick={tick} axisLine={false} tickLine={false} width={40} tickFormatter={compactAxis} />
                <Tooltip formatter={(value) => formatPKR(Number(value))} contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="net" stroke="#0f766e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>
        </>
      ) : null}
    </div>
  );
}
