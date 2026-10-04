"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, Input, Select } from "@/components/ui";
import { MONTH_NAMES } from "@/lib/utils";

export function ReportPeriodLaunch({ types }: { types: Array<{ type: string; title: string }> }) {
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState(types[0]?.type ?? "profit-loss");
  const [period, setPeriod] = useState("month");
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const href = useMemo(() => {
    const params = new URLSearchParams({ type: report, period, year });
    if (period === "month") params.set("month", month);
    if (period === "custom") {
      if (from) params.set("from", from);
      if (to) params.set("to", to);
    }
    return `/reports/print?${params.toString()}`;
  }, [report, period, month, year, from, to]);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>Print / Export PDF</Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-navy">Configure report</h2>
            <div className="mt-4 grid gap-3">
              <Select value={report} onChange={(event) => setReport(event.target.value)}>
                {types.map((item) => (
                  <option key={item.type} value={item.type}>{item.title}</option>
                ))}
              </Select>
              <Select value={period} onChange={(event) => setPeriod(event.target.value)}>
                <option value="month">Monthly</option>
                <option value="year">Yearly</option>
                <option value="custom">Custom date range</option>
              </Select>
              {period === "month" ? (
                <Select value={month} onChange={(event) => setMonth(event.target.value)}>
                  {MONTH_NAMES.map((label, index) => (
                    <option key={label} value={index + 1}>{label}</option>
                  ))}
                </Select>
              ) : null}
              {period !== "custom" ? (
                <Input type="number" min="2000" value={year} onChange={(event) => setYear(event.target.value)} />
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
                  <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Link href={href} className="inline-flex h-10 items-center rounded-xl bg-teal px-4 text-sm font-medium text-white">
                Open printable report
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function ProgressReportLaunch({
  classes,
  defaultClassId,
}: {
  classes: Array<{ id: string; label: string }>;
  defaultClassId?: string;
}) {
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [classId, setClassId] = useState(defaultClassId ?? "");
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));

  const href = useMemo(() => {
    const params = new URLSearchParams({ type: "student-progress", period: "month", month, year });
    if (classId) params.set("classId", classId);
    return `/reports/print?${params.toString()}`;
  }, [classId, month, year]);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>Print progress report</Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-navy">Monthly student progress report</h2>
            <div className="mt-4 grid gap-3">
              <Select value={classId} onChange={(event) => setClassId(event.target.value)}>
                <option value="">All classes</option>
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </Select>
              <Select value={month} onChange={(event) => setMonth(event.target.value)}>
                {MONTH_NAMES.map((label, index) => (
                  <option key={label} value={index + 1}>{label}</option>
                ))}
              </Select>
              <Input type="number" min="2000" value={year} onChange={(event) => setYear(event.target.value)} />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Link href={href} className="inline-flex h-10 items-center rounded-xl bg-teal px-4 text-sm font-medium text-white">
                Open printable report
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
