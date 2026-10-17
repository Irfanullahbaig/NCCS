"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const staleAction = /was not found on the server|failed-to-find-server-action/i.test(error.message);

  useEffect(() => {
    if (!staleAction) return;
    const key = "nccs-reload-stale-action";
    if (sessionStorage.getItem(key) === "1") return;
    sessionStorage.setItem(key, "1");
    window.location.reload();
  }, [staleAction]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md rounded-2xl border border-rose-100 bg-white p-8 text-center">
        <h2 className="text-lg font-semibold text-navy">This page could not load</h2>
        <p className="mt-2 text-sm text-slate-600">
          {staleAction
            ? "The app was updated. Reloading to get a fresh sign-in form."
            : error.message || "A server error occurred."}
        </p>
        <button
          className="mt-6 h-11 rounded-xl bg-teal px-5 text-sm font-medium text-white hover:bg-teal-500"
          onClick={() => {
            sessionStorage.removeItem("nccs-reload-stale-action");
            window.location.reload();
          }}
          type="button"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
