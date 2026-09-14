import { prisma } from "@/lib/db";

export async function writeAudit(input: {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown> | string | null;
}) {
  await prisma.auditLog.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      details:
        typeof input.details === "string"
          ? input.details
          : input.details
            ? JSON.stringify(input.details)
            : null,
    },
  });
}
