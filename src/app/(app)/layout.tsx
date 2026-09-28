import { AppShell } from "@/components/layout";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SCHOOL_NAME } from "@/lib/constants";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  let schoolName = SCHOOL_NAME;
  try {
    const setting = await db().from("Setting").select("value").eq("key", "schoolName").maybeSingle();
    if (setting.error) throw setting.error;
    schoolName = setting.data?.value || SCHOOL_NAME;
  } catch (error) {
    console.error("Unable to load school settings", error);
  }
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
