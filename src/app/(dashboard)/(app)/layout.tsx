import { AppShell } from "@/components/layout";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSchoolName } from "@/lib/school";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const schoolName = await getSchoolName();
  if (!process.env.VERCEL && can(user.role, "backup.manage")) {
    void import("@/lib/backup").then(({ ensureWeeklyBackup }) => ensureWeeklyBackup()).catch(() => undefined);
  }
  return (
    <div className="min-h-screen">
      <AppShell user={user} schoolName={schoolName} />
      <div className="lg:pl-[17rem] print:pl-0">
        <main className="mx-auto max-w-[1440px] px-4 pb-12 pt-4 sm:px-6 lg:pt-6 print:max-w-none print:p-0">{children}</main>
      </div>
    </div>
  );
}
