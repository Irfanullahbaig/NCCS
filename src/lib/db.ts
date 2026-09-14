import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function assertDatabaseUrl() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) {
    throw new Error("DATABASE_URL is not set. Add your Supabase Postgres URI to .env.");
  }
  if (url.startsWith("file:")) {
    throw new Error("DATABASE_URL still points at SQLite. Replace it with your Supabase Postgres connection string.");
  }
}

assertDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function reconnectPrisma() {
  await prisma.$disconnect();
  await prisma.$connect();
}
