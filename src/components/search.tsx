"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui";

type Result = {
  students: Array<{ id: string; name: string; meta: string }>;
  staff: Array<{ id: string; name: string; meta: string }>;
  classes: Array<{ id: string; name: string; meta: string }>;
};

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Result | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    const handle = setTimeout(async () => {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (response.ok) setResults(await response.json());
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={box} className="relative">
      <Input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search students, staff, classes..."
        className="pl-9"
      />
      {open && results ? (
        <div className="absolute mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          {!results.students.length && !results.staff.length && !results.classes.length ? (
            <p className="px-4 py-3 text-sm text-slate-500">No matches found</p>
          ) : (
            <div className="max-h-80 overflow-auto py-2">
              {results.students.length ? (
                <Group title="Students">
                  {results.students.map((item) => (
                    <Link
                      key={item.id}
                      href={`/students/${item.id}`}
                      className="block px-4 py-2 hover:bg-slate-50"
                      onClick={() => setOpen(false)}
                    >
                      <p className="text-sm font-medium text-navy">{item.name}</p>
                      <p className="text-xs text-slate-500">{item.meta}</p>
                    </Link>
                  ))}
                </Group>
              ) : null}
              {results.staff.length ? (
                <Group title="Staff">
                  {results.staff.map((item) => (
                    <Link
                      key={item.id}
                      href={`/staff/${item.id}`}
                      className="block px-4 py-2 hover:bg-slate-50"
                      onClick={() => setOpen(false)}
                    >
                      <p className="text-sm font-medium text-navy">{item.name}</p>
                      <p className="text-xs text-slate-500">{item.meta}</p>
                    </Link>
                  ))}
                </Group>
              ) : null}
              {results.classes.length ? (
                <Group title="Classes">
                  {results.classes.map((item) => (
                    <Link
                      key={item.id}
                      href={`/classes/${item.id}`}
                      className="block px-4 py-2 hover:bg-slate-50"
                      onClick={() => setOpen(false)}
                    >
                      <p className="text-sm font-medium text-navy">{item.name}</p>
                      <p className="text-xs text-slate-500">{item.meta}</p>
                    </Link>
                  ))}
                </Group>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      {children}
    </div>
  );
}
