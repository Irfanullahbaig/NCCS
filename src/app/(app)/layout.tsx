import { AppShell } from "@/components/layout";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SCHOOL_NAME } from "@/lib/constants";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const setting = await prisma.setting.findUnique({ where: { key: "schoolName" } });
  if (can(user.role, "backup.manage")) {
    void import("@/lib/backup").then(({ ensureWeeklyBackup }) => ensureWeeklyBackup()).catch(() => undefined);
  }
  return (
    <AppShell user={user} schoolName={setting?.value || SCHOOL_NAME}>
      {children}
    </AppShell>
  );
}
