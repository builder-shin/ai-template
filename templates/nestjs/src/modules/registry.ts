import type { INestApplicationContext } from "@nestjs/common";
import { IncludeRegistry } from "../core/jsonapi/include.js";
import { RolesRepository } from "./roles/index.js";
import { registerAuthJobs } from "./auth/index.js";
import { registerRealtime } from "./realtime/index.js";
import { registerPeriodic } from "../core/jobs/names.js";
export { registerJob, registerPeriodic } from "../core/jobs/names.js";
export function registerDomain(app: INestApplicationContext): void {
  registerAuthJobs(app);
  registerPeriodic({ name: "auth.purge_expired", pattern: "0 3 * * *", tz: "UTC" });
  registerRealtime(app);
  const repository = app.get<RolesRepository>(RolesRepository);
  app
    .get<IncludeRegistry>(IncludeRegistry)
    .register("roles", (tx, ids) => repository.load(tx, ids));
}
