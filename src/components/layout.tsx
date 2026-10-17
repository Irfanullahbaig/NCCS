import { Search } from "lucide-react";
import type { Role } from "@/lib/enums";
import { ROLE_LABELS } from "@/lib/constants";
import { GlobalSearch } from "@/components/search";
import { BrandLogo } from "@/components/logo";
import { ShellChrome } from "@/components/shell-chrome";

export function AppShell({
  user,
  schoolName,
}: {
  user: { name: string; email: string; role: Role };
  schoolName: string;
}) {
  return (
    <ShellChrome user={user} schoolName={schoolName}>
      <BrandLogo compact className="hidden w-28 sm:inline-flex lg:hidden" />
      <div className="relative hidden max-w-xl flex-1 md:block">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <GlobalSearch />
      </div>
      <div className="ml-auto flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium text-navy">{user.name}</p>
          <p className="text-xs text-slate-500">{ROLE_LABELS[user.role]}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal text-sm font-semibold text-white">
          {user.name.slice(0, 1).toUpperCase()}
        </div>
      </div>
    </ShellChrome>
  );
}
