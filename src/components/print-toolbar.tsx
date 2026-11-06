"use client";

import Link from "next/link";
import { Button } from "@/components/ui";

export function PrintToolbar({ backHref = "/reports", backLabel = "Back to reports" }: { backHref?: string; backLabel?: string } = {}) {
  return (
    <div className="report-toolbar no-print mb-6 flex flex-wrap gap-3">
      <Link href={backHref} className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-sm">
        {backLabel}
      </Link>
      <Button type="button" onClick={() => window.print()}>
        Print / Save PDF
      </Button>
    </div>
  );
}
