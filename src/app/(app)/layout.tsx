import { AppShell } from "@/components/layout";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SCHOOL_NAME } from "@/lib/constants";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  let schoolName = SCHOOL_NAME;
  try {
    const setting = await prisma.setting.findUnique({ where: { key: "schoolName" } });
    schoolName = setting?.value || SCHOOL_NAME;
  } catch (error) {
    console.error("Unable to load school settings", error);
  }
  if (!process.env.VERCEL && can(user.role, "backup.manage")) {
    void import("@/lib/backup").then(({ ensureWeeklyBackup }) => ensureWeeklyBackup()).catch(() => undefined);
  }
  return (
    <AppShell user={user} schoolName={schoolName}>
      {children}
    </AppShell>
  );
}
