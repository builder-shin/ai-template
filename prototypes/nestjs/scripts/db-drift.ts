import { loadSettings } from "../src/core/config/settings.js";
import { assertOwnedPostgres, guardDatabase } from "./db-guard.js";
import { prisma } from "./prisma.js";
const settings = loadSettings(process.env);
assertOwnedPostgres(settings.DATABASE_URL);
await guardDatabase(settings.DATABASE_URL);
prisma([
  "migrate",
  "diff",
  "--from-config-datasource",
  "--to-schema",
  "prisma/schema.prisma",
  "--exit-code",
]);
