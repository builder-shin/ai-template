import type { INestApplicationContext } from "@nestjs/common";
import { IncludeRegistry } from "../core/jsonapi/include.js";
import { RolesRepository } from "./roles/index.js";
export { registerJob, registerPeriodic } from "../core/jobs/names.js";
export function registerDomain(app: INestApplicationContext): void {
  const repository = app.get<RolesRepository>(RolesRepository);
  app
    .get<IncludeRegistry>(IncludeRegistry)
    .register("roles", (tx, ids) => repository.load(tx, ids));
}
