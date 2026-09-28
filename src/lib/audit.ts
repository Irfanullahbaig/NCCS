import { db, newId } from "@/lib/db";

export async function writeAudit(input: {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown> | string | null;
}) {
  const { error } = await db().from("AuditLog").insert({
    id: newId(),
    userId: input.userId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    createdAt: new Date().toISOString(),
    details:
      typeof input.details === "string"
        ? input.details
        : input.details
          ? JSON.stringify(input.details)
          : null,
  });
  if (error) throw error;
}
