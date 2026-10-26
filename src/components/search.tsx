"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  CornerDownLeft,
  FileText,
  GraduationCap,
  History,
  Layers,
  Receipt,
  Search,
  Shield,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import type { Role } from "@/lib/enums";
import { can } from "@/lib/permissions";
import { NAV_PAGES } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import type { SearchGroup, SearchHit, SearchPreview, SearchType } from "@/lib/search";

const TYPE_ICONS: Record<SearchType, typeof Search> = {
  page: FileText,
  action: Zap,
  student: GraduationCap,
  staff: Users,
  class: BookOpen,
  program: Layers,
  subject: Layers,
  income: Wallet,
  expense: Receipt,
  payment: Receipt,
  user: Shield,
};

const RECENT_KEY = "nccs.search.recent";

type Recent = { title: string; subtitle: string; href: string; type: SearchType };

function readRecent(): Recent[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 6) : [];
  } catch {
    return [];
  }
}

function saveRecent(item: Recent) {
  try {
    const next = [item, ...readRecent().filter((entry) => entry.href !== item.href)].slice(0, 6);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Recent searches are a convenience only.
  }
}

function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
}

/** Header trigger plus the Ctrl/⌘ K command palette. */
export function GlobalSearch({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    // Platform is only known in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      } else if (event.key === "/" && !isTypingTarget(event.target)) {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-11 w-full max-w-xl items-center gap-2.5 rounded-full bg-white px-4 text-left text-sm text-slate-400 shadow-card transition hover:text-slate-500 md:flex"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 truncate">Search students, classes, fees, receipts…</span>
        <kbd className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
          {isMac ? "⌘" : "Ctrl"} K
        </kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-white p-2.5 text-slate-600 shadow-card md:hidden"
        aria-label="Search"
      >
        <Search className="h-5 w-5" />
      </button>
      {open ? <CommandPalette role={role} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function CommandPalette({ role, onClose }: { role: Role; onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [recent] = useState<Recent[]>(() => (typeof window === "undefined" ? [] : readRecent()));
  const [result, setResult] = useState<{ q: string; groups: SearchGroup[]; error: string | null } | null>(null);
  const trimmed = query.trim();

  useEffect(() => {
    inputRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    if (trimmed.length < 2) return;
    const controller = new AbortController();
    const handle = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal });
        const body = await response.json();
        setResult({ q: trimmed, groups: response.ok ? body.groups : [], error: response.ok ? null : body.error ?? "Search failed" });
      } catch (error) {
        if ((error as Error).name !== "AbortError") setResult({ q: trimmed, groups: [], error: "Search failed" });
      }
    }, 150);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [trimmed]);

  const suggestions = useMemo<SearchGroup[]>(() => {
    const groups: SearchGroup[] = [];
    if (recent.length) {
      groups.push({
        type: "page",
        label: "Recent",
        hits: recent.map((item) => ({
          key: `recent:${item.href}`,
          type: item.type,
          id: item.href,
          title: item.title,
          subtitle: item.subtitle,
          href: item.href,
          actions: [],
          previewable: false,
          score: 0,
        })),
      });
    }
    groups.push({
      type: "page",
      label: "Go to",
      hits: NAV_PAGES.filter((page) => can(role, page.permission) && !(page.href === "/finance" && !can(role, "finance.analytics")))
        .slice(0, 8)
        .map((page) => ({
          key: `nav:${page.href}`,
          type: "page" as const,
          id: page.href,
          title: page.label,
          subtitle: `Go to ${page.label}`,
          href: page.href,
          actions: [],
          previewable: false,
          score: 0,
        })),
    });
    return groups;
  }, [recent, role]);

  const searching = trimmed.length >= 2;
  const loading = searching && result?.q !== trimmed;
  // While a new search is loading, keep showing the previous results.
  const groups = useMemo(() => (searching ? result?.groups ?? [] : suggestions), [searching, result, suggestions]);
  const flat = useMemo(() => groups.flatMap((group) => group.hits), [groups]);
  const activeIndex = flat.length ? Math.min(active, flat.length - 1) : 0;
  const current = flat[activeIndex];

  const go = useCallback(
    (href: string, hit?: SearchHit) => {
      if (hit) saveRecent({ title: hit.title, subtitle: hit.subtitle, href: hit.href, type: hit.type });
      onClose();
      router.push(href);
    },
    [onClose, router],
  );

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((value) => (flat.length ? (Math.min(value, flat.length - 1) + 1) % flat.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((value) => (flat.length ? (Math.min(value, flat.length - 1) - 1 + flat.length) % flat.length : 0));
    } else if (event.key === "Enter" && current) {
      event.preventDefault();
      const first = current.actions[0];
      go(event.shiftKey && first ? first.href : current.href, current);
    }
  }

  let index = -1;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-navy/40 p-3 pt-[8vh] backdrop-blur-sm sm:p-6 sm:pt-[10vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Global search"
        className="flex max-h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200/70"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <Search className="h-5 w-5 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            placeholder="Search a student, class, teacher, receipt, page… e.g. “fees”, “October”, “Grade 10”"
            className="h-14 w-full bg-transparent text-base text-navy outline-none placeholder:text-slate-400"
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="global-search-results"
            aria-activedescendant={current ? `search-hit-${activeIndex}` : undefined}
          />
          {loading ? <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-teal" /> : null}
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-navy" aria-label="Close search">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1">
          <div ref={listRef} id="global-search-results" role="listbox" className="min-h-0 flex-1 overflow-y-auto py-2 lg:max-w-[55%] lg:border-r lg:border-slate-100">
            {searching && !loading && result?.error ? (
              <p className="px-4 py-6 text-sm text-rose-600">{result.error}</p>
            ) : searching && !loading && !flat.length ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-navy">No matches for “{trimmed}”</p>
                <p className="mt-1 text-xs text-slate-500">Try a name, registration number, receipt number, class code or a page like “fees”.</p>
              </div>
            ) : (
              groups.map((group) => (
                <div key={`${group.label}-${group.type}`} className="mb-1">
                  <p className="flex items-center gap-1.5 px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {group.label === "Recent" ? <History className="h-3 w-3" /> : null}
                    {group.label}
                  </p>
                  {group.hits.map((hit) => {
                    index += 1;
                    const position = index;
                    const Icon = TYPE_ICONS[hit.type] ?? FileText;
                    const selected = position === activeIndex;
                    return (
                      <div
                        key={hit.key}
                        id={`search-hit-${position}`}
                        data-index={position}
                        role="option"
                        aria-selected={selected}
                        onMouseMove={() => setActive(position)}
                        onClick={() => go(hit.href, hit)}
                        className={cn("mx-2 flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2", selected ? "bg-peach/70" : "hover:bg-slate-50")}
                      >
                        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", selected ? "bg-gold text-white" : "bg-slate-100 text-slate-500")}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-navy">{hit.title}</span>
                            {hit.badge ? <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700">{hit.badge}</span> : null}
                          </span>
                          <span className="block truncate text-xs text-slate-500">{hit.subtitle}</span>
                        </span>
                        {selected ? (
                          <span className="hidden shrink-0 items-center gap-1 sm:flex">
                            {hit.actions.slice(0, 2).map((action) => (
                              <button
                                key={action.href}
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  go(action.href, hit);
                                }}
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:border-teal hover:text-teal"
                              >
                                {action.label}
                              </button>
                            ))}
                            <CornerDownLeft className="ml-1 h-3.5 w-3.5 text-slate-400" />
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
          <div className="hidden min-h-0 flex-1 overflow-y-auto lg:block">
            {current ? <PreviewPane hit={current} onGo={(href) => go(href, current)} /> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
          <span><Key>↑</Key> <Key>↓</Key> move</span>
          <span><Key>Enter</Key> open</span>
          <span><Key>Shift</Key> + <Key>Enter</Key> first action</span>
          <span><Key>Esc</Key> close</span>
        </div>
      </div>
    </div>
  );
}

function Key({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-slate-200 bg-white px-1 py-0.5 font-medium text-slate-600">{children}</kbd>;
}

const previewCache = new Map<string, SearchPreview | null>();

function PreviewPane({ hit, onGo }: { hit: SearchHit; onGo: (href: string) => void }) {
  const cacheKey = `${hit.type}:${hit.id}`;
  const [loaded, setLoaded] = useState<{ key: string; preview: SearchPreview | null } | null>(null);

  useEffect(() => {
    if (!hit.previewable || previewCache.has(cacheKey)) return;
    const controller = new AbortController();
    const handle = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/preview?type=${hit.type}&id=${encodeURIComponent(hit.id)}`, { signal: controller.signal });
        const body = await response.json();
        const preview = response.ok ? (body.preview as SearchPreview) : null;
        previewCache.set(cacheKey, preview);
        setLoaded({ key: cacheKey, preview });
      } catch {
        // Aborted when the highlighted result changes; nothing to show.
      }
    }, 120);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [cacheKey, hit.id, hit.previewable, hit.type]);

  if (!hit.previewable) {
    return (
      <div className="p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{hit.type === "action" ? "Quick action" : "Open"}</p>
        <p className="mt-1 text-lg font-semibold text-navy">{hit.title}</p>
        <p className="mt-1 text-sm text-slate-500">{hit.subtitle}</p>
        <button
          type="button"
          onClick={() => onGo(hit.href)}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal-500"
        >
          Open <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const preview = previewCache.has(cacheKey) ? previewCache.get(cacheKey) : loaded?.key === cacheKey ? loaded.preview : undefined;
  if (preview === undefined) {
    return (
      <div className="space-y-3 p-5">
        <div className="h-5 w-2/3 animate-pulse rounded bg-slate-100" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
        <div className="grid grid-cols-3 gap-2 pt-2">
          {[0, 1, 2].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}
        </div>
      </div>
    );
  }
  if (!preview) return <p className="p-5 text-sm text-slate-500">No preview available.</p>;

  return (
    <div className="p-5">
      <p className="text-lg font-semibold text-navy">{preview.title}</p>
      <p className="mt-0.5 text-sm text-slate-500">{preview.subtitle}</p>
      {preview.stats.length ? (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {preview.stats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-slate-100 p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{stat.label}</p>
              <p
                className={cn(
                  "mt-0.5 truncate text-sm font-semibold capitalize",
                  stat.tone === "good" && "text-emerald-700",
                  stat.tone === "warn" && "text-amber-700",
                  stat.tone === "bad" && "text-rose-700",
                  !stat.tone && "text-navy",
                )}
              >
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      ) : null}
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {preview.fields.map((field) => (
          <div key={field.label} className="min-w-0">
            <dt className="text-[11px] uppercase tracking-wide text-slate-400">{field.label}</dt>
            <dd className="truncate font-medium text-navy">{field.value}</dd>
          </div>
        ))}
      </dl>
      {preview.list.length ? (
        <div className="mt-4">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{preview.listTitle}</p>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {preview.list.map((item, position) => (
              <li key={`${item.title}-${position}`}>
                {item.href ? (
                  <button type="button" onClick={() => onGo(item.href!)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-navy">{item.title}</span>
                      <span className="block truncate text-xs text-slate-500">{item.subtitle}</span>
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  </button>
                ) : (
                  <div className="px-3 py-2">
                    <span className="block text-sm text-navy">{item.title}</span>
                    <span className="block text-xs text-slate-500">{item.subtitle}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-2">
        {preview.actions.map((action, position) => (
          <button
            key={action.href}
            type="button"
            onClick={() => onGo(action.href)}
            className={cn(
              "rounded-xl px-3 py-2 text-sm font-medium",
              position === 0 ? "bg-teal text-white hover:bg-teal-500" : "border border-slate-200 text-slate-700 hover:bg-slate-50",
            )}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
