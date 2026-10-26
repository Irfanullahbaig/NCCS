import type { Role } from "@/lib/enums";
import { ROLE_LABELS } from "@/lib/constants";
import { GlobalSearch } from "@/components/search";
import { ShellChrome } from "@/components/shell-chrome";

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function AppShell({
  user,
  schoolName,
}: {
  user: { name: string; email: string; role: Role };
  schoolName: string;
}) {
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Karachi" }).format(now));
  const today = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Karachi" }).format(now);
  const firstName = user.name.split(" ")[0] || user.name;

  return (
    <ShellChrome user={user} schoolName={schoolName}>
      <div className="hidden min-w-0 shrink-0 xl:block xl:w-60">
        <p className="truncate text-sm font-semibold text-navy">{greeting(hour)}, {firstName}</p>
        <p className="truncate text-xs text-slate-500">{today}</p>
      </div>
      <div className="flex min-w-0 flex-1 justify-end md:justify-center">
        <GlobalSearch role={user.role} />
      </div>
      <div className="flex shrink-0 items-center gap-2.5 rounded-full bg-white py-1.5 pl-1.5 pr-1.5 shadow-card sm:pr-4">
        <div className="brand-gradient flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white">
          {user.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="hidden min-w-0 sm:block">
          <p className="max-w-[10rem] truncate text-sm font-semibold leading-tight text-navy">{user.name}</p>
          <p className="text-[11px] leading-tight text-slate-500">{ROLE_LABELS[user.role]}</p>
        </div>
      </div>
    </ShellChrome>
  );
}
