import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/ui";

export default async function AuditPage() {
  await requirePermission("audit.view");
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: true },
  });

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
                    <td>{log.createdAt.toLocaleString()}</td>
                    <td>{log.user?.name ?? "System"}</td>
                    <td>{log.action.replaceAll("_", " ")}</td>
                    <td>{log.entityType}{log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ""}</td>
                    <td className="max-w-sm truncate text-slate-500">{log.details}</td>
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
