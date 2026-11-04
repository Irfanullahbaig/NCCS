import { SCHOOL_NAME } from "@/lib/constants";

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal">{SCHOOL_NAME}</p>
        <p className="mt-2 text-sm text-slate-500">Loading the dashboard…</p>
      </div>
    </div>
  );
}
