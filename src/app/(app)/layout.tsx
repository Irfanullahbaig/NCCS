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
    <div className="min-h-screen bg-surface">
      <AppShell user={user} schoolName={schoolName} />
      <div className="lg:pl-72">
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
