import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Field, Input, Button } from "@/components/ui";
import { saveSettingsForm } from "@/actions/users";
import { createAcademicYearForm } from "@/actions/classes";
import { listBackups, ensureWeeklyBackup } from "@/lib/backup";
import { BackupActions } from "@/components/backup-forms";

export default async function SettingsPage() {
  await requirePermission("settings.manage");
  await ensureWeeklyBackup().catch(() => undefined);
  const settings = await prisma.setting.findMany();
  const map = Object.fromEntries(settings.map((item) => [item.key, item.value]));
  const years = await prisma.academicYear.findMany({ orderBy: { startDate: "desc" } });
  const backups = await listBackups();

  return (
    <div>
      <PageHeader title="Settings" subtitle="School profile, academic years, and database backup recovery." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="School profile">
          <form action={saveSettingsForm} className="grid gap-4">
            <Field label="School name"><Input name="schoolName" defaultValue={map.schoolName ?? "NCCS"} /></Field>
            <Field label="Address"><Input name="schoolAddress" defaultValue={map.schoolAddress ?? ""} /></Field>
            <Field label="Phone"><Input name="schoolPhone" defaultValue={map.schoolPhone ?? ""} /></Field>
            <Field label="Currency prefix"><Input name="currencyPrefix" defaultValue={map.currencyPrefix ?? "Rs."} /></Field>
            <Button type="submit">Save settings</Button>
          </form>
        </Card>
        <Card title="Academic years">
          <ul className="mb-4 space-y-2 text-sm">
            {years.map((year) => (
              <li key={year.id} className="flex justify-between">
                <span>{year.name}</span>
                <span className="text-slate-500">{year.isActive ? "Active" : ""}</span>
              </li>
            ))}
          </ul>
          <form action={createAcademicYearForm} className="grid gap-3">
            <Field label="Name"><Input name="name" placeholder="2026-2027" required /></Field>
            <Field label="Start date"><Input type="date" name="startDate" required /></Field>
            <Field label="End date"><Input type="date" name="endDate" required /></Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" /> Set as active
            </label>
            <Button type="submit">Add academic year</Button>
          </form>
        </Card>
      </div>
      <Card title="Database backup & recovery" className="mt-4">
        <p className="mb-4 text-sm text-slate-600">
          A complete JSON snapshot of the Supabase database is created automatically every week. You can also download a copy now or restore an earlier backup. Restore is limited to Admin.
        </p>
        <BackupActions backups={backups} />
      </Card>
    </div>
  );
}
