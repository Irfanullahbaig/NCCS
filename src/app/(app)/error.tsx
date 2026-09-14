"use client";

import { Button } from "@/components/ui";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="rounded-2xl border border-rose-100 bg-white p-8 text-center">
      <h2 className="text-lg font-semibold text-navy">Something went wrong</h2>
      <p className="mt-2 text-sm text-slate-500">{error.message}</p>
      <Button className="mt-4" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
