import { Select, Input } from "@/components/ui";
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
  return (
    <form action={action} className="mb-4 grid gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:grid-cols-6">
      <Select name="period" defaultValue={period.mode}>
        <option value="month">Monthly</option>
        <option value="year">Yearly</option>
        <option value="custom">Custom range</option>
      </Select>
      <Select name="month" defaultValue={String(period.month ?? new Date().getMonth() + 1)}>
        {MONTH_NAMES.map((label, index) => (
          <option key={label} value={index + 1}>{label}</option>
        ))}
      </Select>
      <Input type="number" name="year" min="2000" defaultValue={period.year} />
      <Input type="date" name="from" defaultValue={period.mode === "custom" ? period.from.toISOString().slice(0, 10) : ""} />
      <Input type="date" name="to" defaultValue={period.mode === "custom" ? period.to.toISOString().slice(0, 10) : ""} />
      {extra}
      <button className="h-10 rounded-xl bg-navy text-sm font-medium text-white">Apply</button>
    </form>
  );
}
