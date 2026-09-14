import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function resolveDatabaseUrl() {
  const candidates = [process.env.DIRECT_URL, process.env.DATABASE_URL];
  const postgres = candidates.filter((value): value is string => Boolean(value?.startsWith("postgres")));
  return postgres.find((value) => value.includes(":5432")) ?? postgres[0] ?? process.env.DATABASE_URL ?? "";
}

function createPrismaClient() {
  const url = resolveDatabaseUrl();
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(url ? { datasources: { db: { url } } } : {}),
  });
}

function getPrisma() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    if (prop === "then") return undefined;
    const client = getPrisma();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export async function reconnectPrisma() {
  if (globalForPrisma.prisma) {
    await globalForPrisma.prisma.$disconnect();
    globalForPrisma.prisma = undefined;
  }
  await getPrisma().$connect();
}
