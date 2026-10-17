"use client";

import Link from "next/link";
import { Button } from "@/components/ui";

export function PrintToolbar() {
  return (
    <div className="no-print mb-6 flex gap-3">
      <Link href="/reports" className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-sm">
        Back to reports
      </Link>
      <Button type="button" onClick={() => window.print()}>
        Print / Save PDF
      </Button>
    </div>
  );
}
