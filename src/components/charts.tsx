"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatPKR } from "@/lib/utils";

export function FinanceCharts({
  data,
}: {
  data: Array<{ label: string; income: number; expenses: number; fees: number }>;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="h-72">
        <p className="mb-3 text-sm font-semibold text-navy">Monthly income vs expenses</p>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e6ebf2" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value) => formatPKR(Number(value))} />
            <Legend />
            <Bar dataKey="income" fill="#0f766e" name="Income" radius={[6, 6, 0, 0]} />
            <Bar dataKey="expenses" fill="#be123c" name="Expenses" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="h-72">
        <p className="mb-3 text-sm font-semibold text-navy">Fee collection</p>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e6ebf2" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value) => formatPKR(Number(value))} />
            <Line type="monotone" dataKey="fees" stroke="#1a3b66" strokeWidth={3} name="Student fees" dot={false} />
            <Line type="monotone" dataKey="income" stroke="#14b8a6" strokeWidth={3} name="Total income" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
