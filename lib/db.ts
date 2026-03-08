import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __tenderHunterPrisma__: PrismaClient | undefined;
}

export function getPrismaClient() {
  if (!global.__tenderHunterPrisma__) {
    global.__tenderHunterPrisma__ = new PrismaClient();
  }

  return global.__tenderHunterPrisma__;
}

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}
