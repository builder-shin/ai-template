import type { INestApplicationContext } from "@nestjs/common";
import { IncludeRegistry } from "../core/jsonapi/include.js";
import { RolesRepository } from "./roles/index.js";
import { registerAuthJobs } from "./auth/index.js";
import { registerRealtime } from "./realtime/index.js";
import { FilesService, registerFileJobs } from "./files/index.js";
import { UsersRepository, MeRealtimeBridge } from "./users/index.js";
import { registerFileReadRule } from "./files/index.js";
import { registerPeriodic } from "../core/jobs/names.js";
export { registerJob, registerPeriodic } from "../core/jobs/names.js";
const avatarReadRule: Parameters<typeof registerFileReadRule>[0] = (tx, _viewer, ids) =>
  new UsersRepository().publicAvatarIds(tx, ids);
export function registerDomain(app: INestApplicationContext): void {
  registerAuthJobs(app);
  app.get<MeRealtimeBridge>(MeRealtimeBridge).register();
  registerFileReadRule(avatarReadRule);
  app
    .get<IncludeRegistry>(IncludeRegistry)
    .register("users", (tx, ids) => app.get<UsersRepository>(UsersRepository).load(tx, ids));
  registerPeriodic({ name: "auth.purge_expired", pattern: "0 3 * * *", tz: "UTC" });
  registerRealtime(app);
  registerFileJobs(app);
  registerPeriodic({ name: "files.purge_pending", pattern: "0 * * * *", tz: "UTC" });
  app
    .get<IncludeRegistry>(IncludeRegistry)
    .register("files", (tx, ids, viewer) => app.get(FilesService).load(tx, ids, viewer));
  const repository = app.get<RolesRepository>(RolesRepository);
  app
    .get<IncludeRegistry>(IncludeRegistry)
    .register("roles", (tx, ids) => repository.load(tx, ids));
}
