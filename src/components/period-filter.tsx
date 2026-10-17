"use client";

import { useState } from "react";
import { Select, Input, Label } from "@/components/ui";
import { MONTH_NAMES } from "@/lib/utils";
import type { ResolvedPeriod } from "@/lib/period";

export function PeriodFilter({
  action,
  period,
  extra,
}: {
  action: string;
  period: ResolvedPeriod;
  extra?: React.ReactNode;
}) {
  const [mode, setMode] = useState(period.mode);

  return (
    <form action={action} className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
      <div className="min-w-[9rem] flex-1">
        <Label htmlFor="period-mode">View</Label>
        <Select id="period-mode" name="period" value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
          <option value="month">Monthly</option>
          <option value="year">Yearly</option>
          <option value="custom">Custom range</option>
        </Select>
      </div>
      {mode === "month" ? (
        <div className="min-w-[9rem] flex-1">
          <Label htmlFor="period-month">Month</Label>
          <Select id="period-month" name="month" defaultValue={String(period.month ?? new Date().getMonth() + 1)}>
            {MONTH_NAMES.map((label, index) => (
              <option key={label} value={index + 1}>{label}</option>
            ))}
          </Select>
        </div>
      ) : (
        <input type="hidden" name="month" value={String(period.month ?? new Date().getMonth() + 1)} />
      )}
      {mode !== "custom" ? (
        <div className="w-28">
          <Label htmlFor="period-year">Year</Label>
          <Input id="period-year" type="number" name="year" min="2000" defaultValue={period.year} />
        </div>
      ) : (
        <>
          <div className="min-w-[9rem] flex-1">
            <Label htmlFor="period-from">From</Label>
            <Input id="period-from" type="date" name="from" defaultValue={period.from.toISOString().slice(0, 10)} />
          </div>
          <div className="min-w-[9rem] flex-1">
            <Label htmlFor="period-to">To</Label>
            <Input id="period-to" type="date" name="to" defaultValue={period.to.toISOString().slice(0, 10)} />
          </div>
        </>
      )}
      {extra}
      <button className="h-10 shrink-0 rounded-xl bg-navy px-4 text-sm font-medium text-white">Apply</button>
    </form>
  );
}
