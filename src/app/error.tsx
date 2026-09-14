"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md rounded-2xl border border-rose-100 bg-white p-8 text-center">
        <h2 className="text-lg font-semibold text-navy">This page could not load</h2>
        <p className="mt-2 text-sm text-slate-600">{error.message || "A server error occurred."}</p>
        <button
          className="mt-6 h-11 rounded-xl bg-teal px-5 text-sm font-medium text-white hover:bg-teal-500"
          onClick={reset}
          type="button"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
