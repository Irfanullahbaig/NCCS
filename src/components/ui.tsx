import { clsx } from "clsx";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

function cn(...inputs: Array<string | false | null | undefined>) {
  return twMerge(clsx(inputs));
}

const FIELD =
  "w-full rounded-xl border border-slate-200 bg-white text-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-teal focus:ring-4 focus:ring-teal/10 disabled:cursor-not-allowed disabled:bg-slate-50";

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal/20 disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "h-8 px-3 text-xs",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-11 px-5 text-sm",
        variant === "primary" && "bg-teal text-white shadow-sm shadow-teal/20 hover:bg-teal-500",
        variant === "secondary" && "bg-navy text-white hover:bg-navy-800",
        variant === "ghost" && "text-slate-600 hover:bg-slate-100",
        variant === "outline" && "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
        variant === "danger" && "bg-rose-600 text-white hover:bg-rose-700",
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(FIELD, "h-10 px-3", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(FIELD, "h-10 px-3", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(FIELD, "min-h-24 px-3 py-2", className)} {...props} />;
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-slate-500">
      {children}
    </label>
  );
}

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function Card({
  children,
  className,
  title,
  action,
  id,
  subtitle,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  action?: ReactNode;
  id?: string;
  subtitle?: ReactNode;
}) {
  return (
    <section id={id} className={cn("min-w-0 rounded-3xl bg-white shadow-card", className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-navy">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
          </div>
          {action}
        </header>
      )}
      <div className="p-5 sm:px-6">{children}</div>
    </section>
  );
}

export function Badge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", className)}>
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-peach text-orange">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M4 7h16M4 12h10M4 17h7" strokeLinecap="round" />
        </svg>
      </div>
      <p className="font-semibold text-navy">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-navy sm:text-[1.7rem]">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-3xl text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export type Tone = "teal" | "navy" | "gold" | "rose" | "sky" | "violet";

/** Solid icon discs and soft tag pills, as used on the dashboard cards. */
export const TONE_DISC: Record<Tone, string> = {
  teal: "bg-teal text-white",
  navy: "bg-navy text-white",
  gold: "bg-gold text-white",
  rose: "bg-rose-500 text-white",
  sky: "bg-sky-600 text-white",
  violet: "bg-violet-500 text-white",
};

export const TONE_PILL: Record<Tone, string> = {
  teal: "bg-sage text-teal",
  navy: "bg-slate-100 text-slate-700",
  gold: "bg-peach text-orange",
  rose: "bg-rose-50 text-rose-700",
  sky: "bg-sky-50 text-sky-700",
  violet: "bg-violet-50 text-violet-700",
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "teal",
  href,
  tag,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: Tone;
  href?: string;
  /** Short pill in the top-right corner, e.g. "+12 this month". */
  tag?: ReactNode;
}) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        {icon ? (
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-11 sm:w-11", TONE_DISC[tone])}>{icon}</div>
        ) : (
          <span />
        )}
        {tag ? <span className={cn("truncate rounded-full px-2.5 py-1 text-[11px] font-semibold", TONE_PILL[tone])}>{tag}</span> : null}
      </div>
      <p className="mt-4 text-sm text-slate-500 sm:mt-5">{label}</p>
      <p className="mt-1 break-words text-xl font-bold tracking-tight text-navy sm:text-2xl">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </>
  );
  const className = "block min-w-0 rounded-3xl bg-white p-4 shadow-card sm:p-5";
  if (href) {
    return (
      <a href={href} className={cn(className, "transition hover:-translate-y-0.5 hover:shadow-lg")}>
        {inner}
      </a>
    );
  }
  return <div className={className}>{inner}</div>;
}

export function ErrorText({ children }: { children?: string | null }) {
  if (!children) return null;
  return <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{children}</p>;
}

export function ViewOnlyBadge() {
  return (
    <span className="inline-flex h-10 items-center rounded-xl bg-white px-3 text-xs font-semibold text-slate-600 shadow-card">
      View only
    </span>
  );
}

/** Segmented pill control, e.g. "Month | Year". Each option is a link. */
export function Segmented({ options }: { options: Array<{ label: string; href: string; active: boolean }> }) {
  return (
    <div className="inline-flex rounded-2xl bg-slate-100 p-1">
      {options.map((option) => (
        <a
          key={option.href}
          href={option.href}
          className={cn(
            "rounded-xl px-3.5 py-1.5 text-sm font-medium transition",
            option.active ? "bg-gold text-white shadow-sm" : "text-slate-600 hover:text-navy",
          )}
        >
          {option.label}
        </a>
      ))}
    </div>
  );
}
