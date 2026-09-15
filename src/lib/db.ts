import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function isPostgresUrl(value: string | undefined): value is string {
  return Boolean(value?.startsWith("postgres"));
}

function appendQuery(url: string, param: string) {
  const [name] = param.split("=");
  if (!name || url.includes(`${name}=`)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${param}`;
}

function resolveDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  const candidates = [databaseUrl, directUrl].filter(isPostgresUrl);

  // Vercel must use the transaction pooler (port 6543). Session/direct 5432
  // is for Prisma migrations and is often unreachable from serverless.
  if (process.env.VERCEL) {
    const pooled = candidates.find((value) => value.includes(":6543"));
    if (pooled) return pooled;
  }

  return candidates[0] ?? "";
}

function withConnectParams(url: string) {
  if (!url) return url;
  let next = url;
  if (next.includes(":6543")) {
    next = appendQuery(next, "pgbouncer=true");
    if (process.env.VERCEL) next = appendQuery(next, "connection_limit=1");
  }
  return appendQuery(next, "connect_timeout=10");
}

function createPrismaClient() {
  const url = withConnectParams(resolveDatabaseUrl());
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
