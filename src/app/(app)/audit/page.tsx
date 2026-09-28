import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export default async function AuditPage() {
  await requirePermission("audit.view");
  const logsRes = await db()
    .from("AuditLog")
    .select("*, user:User(*)")
    .order("createdAt", { ascending: false })
    .limit(200);
  if (logsRes.error) throw logsRes.error;
  const logs = logsRes.data ?? [];

  return (
    <div>
      <PageHeader
        title="Audit log"
        subtitle="Student, staff, class, payment, income, and expense actions are recorded with user and timestamp."
      />
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {logs.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDateTime(log.createdAt)}</td>
                    <td>{log.user?.name ?? "System"}</td>
                    <td>{String(log.action ?? "").replaceAll("_", " ") || "—"}</td>
                    <td>{log.entityType}{log.entityId ? ` · ${String(log.entityId).slice(0, 8)}` : ""}</td>
                    <td className="max-w-sm truncate text-slate-500">
                      {typeof log.details === "string" ? log.details : log.details ? JSON.stringify(log.details) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No audit events" description="Actions will appear here as users work in the system." />
        )}
      </div>
    </div>
  );
}
