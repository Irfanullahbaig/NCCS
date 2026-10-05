import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { AddUserButton } from "@/components/forms";
import { ROLE_LABELS } from "@/lib/constants";

export default async function UsersPage() {
  await requirePermission("users.manage");
  const usersRes = await db().from("User").select("id, name, email, role, isActive, createdAt").order("createdAt", { ascending: true });
  if (usersRes.error) throw usersRes.error;
  const users = usersRes.data ?? [];

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Admin-only account management. Accountant/HR cannot modify admin accounts or system settings."
        actions={<AddUserButton />}
      />
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="font-medium text-navy">{user.name}</td>
                  <td>{user.email}</td>
                  <td>{ROLE_LABELS[user.role]}</td>
                  <td>{user.isActive ? "Active" : "Inactive"}</td>
                  <td>{formatDate(user.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
