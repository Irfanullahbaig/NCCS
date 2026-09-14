"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createBackupAction, restoreBackupAction } from "@/actions/backup";
import type { BackupMeta } from "@/lib/backup-types";
import { Button, ErrorText, Field, Input } from "@/components/ui";

function formatBackupDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }) + " UTC";
}

export function BackupActions({ backups }: { backups: BackupMeta[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [restoreName, setRestoreName] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const latest = backups[0];
  const selected = backups.find((backup) => backup.filename === restoreName);

  async function createNow() {
    setPending(true);
    const result = await createBackupAction();
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Backup created");
    router.refresh();
  }

  async function restoreListed(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const result = await restoreBackupAction(new FormData(event.currentTarget));
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Backup restored. A safety copy of the previous database was kept.");
    setConfirmText("");
    router.refresh();
  }

  async function restoreUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploadError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    if (String(data.get("confirm") ?? "") !== "RESTORE") {
      setUploadError("Type RESTORE to confirm that current data will be replaced");
      toast.error("Type RESTORE to confirm that current data will be replaced");
      return;
    }
    setPending(true);
    const response = await fetch("/api/backup/restore", { method: "POST", body: data });
    const payload = await response.json().catch(() => ({ error: "Unable to restore backup" }));
    setPending(false);
    if (!response.ok) {
      const message = payload.error ?? "Unable to restore backup";
      setUploadError(message);
      toast.error(message);
      return;
    }
    toast.success("Backup restored. A safety copy of the previous database was kept.");
    form.reset();
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={createNow} disabled={pending}>
          {pending ? "Working..." : "Create backup now"}
        </Button>
        {latest ? (
          <a
            className="inline-flex h-10 items-center rounded-xl bg-navy px-4 text-sm font-medium text-white hover:bg-navy-800"
            href={`/api/backup/download?file=${encodeURIComponent(latest.filename)}`}
          >
            Download latest backup
          </a>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-100">
        {backups.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Contents</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {backups.map((backup) => (
                  <tr key={backup.filename}>
                    <td>{formatBackupDate(backup.createdAt)}</td>
                    <td className="capitalize">{backup.kind.replace("-", " ")}</td>
                    <td>{Math.max(1, Math.round(backup.size / 1024))} KB</td>
                    <td className="text-xs text-slate-500">
                      {backup.counts.students} students · {backup.counts.staff} staff · {backup.counts.classes} classes · {backup.counts.subjects} subjects
                    </td>
                    <td>
                      <a className="text-sm text-teal" href={`/api/backup/download?file=${encodeURIComponent(backup.filename)}`}>
                        Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-slate-500">No backups yet. Create one now or wait for the weekly automatic backup.</p>
        )}
      </div>
      <form onSubmit={restoreListed} className="grid gap-3 rounded-xl border border-rose-100 bg-rose-50/50 p-4">
        <h3 className="text-sm font-semibold text-rose-800">Restore from a saved backup</h3>
        <p className="text-sm text-rose-700">
          Restoring replaces the current database. The system will automatically save a safety backup of the current data first.
        </p>
        <Field label="Backup file">
          <select
            name="filename"
            value={restoreName}
            onChange={(event) => setRestoreName(event.target.value)}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
            required
          >
            <option value="">Select a backup</option>
            {backups.map((backup) => (
              <option key={backup.filename} value={backup.filename}>
                {formatBackupDate(backup.createdAt)} · {backup.kind}
              </option>
            ))}
          </select>
        </Field>
        {selected ? (
          <p className="text-xs text-slate-600">
            {selected.filename} · {selected.counts.students} students, {selected.counts.staff} teachers, {selected.counts.classes} classes, {selected.counts.feeRecords} fee records, {selected.counts.salaryRecords} salary records.
          </p>
        ) : null}
        <Field label='Type RESTORE to confirm'>
          <Input name="confirm" value={confirmText} onChange={(event) => setConfirmText(event.target.value)} placeholder="RESTORE" />
        </Field>
        <Button type="submit" variant="danger" disabled={pending || confirmText !== "RESTORE"}>
          Restore selected backup
        </Button>
      </form>
      <form onSubmit={restoreUpload} className="grid gap-3 rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-navy">Restore from an uploaded file</h3>
        <Field label="Backup file (.db)">
          <input type="file" name="file" accept=".db,.sqlite" required className="block w-full text-sm" />
        </Field>
        <Field label='Type RESTORE to confirm'>
          <Input name="confirm" placeholder="RESTORE" />
        </Field>
        <ErrorText>{uploadError}</ErrorText>
        <Button type="submit" variant="outline" disabled={pending}>
          Upload and restore
        </Button>
      </form>
    </div>
  );
}
