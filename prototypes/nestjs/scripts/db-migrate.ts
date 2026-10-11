import { loadSettings } from "../src/core/config/settings.js";
import { guardDatabase, assertOwnedPostgres } from "./db-guard.js";
import { prisma } from "./prisma.js";
const settings = loadSettings(process.env);
assertOwnedPostgres(settings.DATABASE_URL);
await guardDatabase(settings.DATABASE_URL);
prisma(["migrate", "deploy"]);
