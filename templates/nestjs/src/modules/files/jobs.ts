import type { INestApplicationContext } from "@nestjs/common";
import { registerJob } from "../../core/jobs/names.js";
import { FilesService } from "./service.js";
export function registerFileJobs(app: INestApplicationContext): void {
  registerJob("files.purge_pending", () => app.get(FilesService).purgePending());
}
