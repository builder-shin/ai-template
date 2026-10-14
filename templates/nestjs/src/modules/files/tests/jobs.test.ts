import "reflect-metadata";
import { expect, it } from "vitest";
import { testApp } from "../../../core/http/tests/fixtures.js";
import { periodicJobs, jobHandlers } from "../../../core/jobs/names.js";
import { FilesService } from "../index.js";
it("앱 등록은 매시간 정각 UTC 정리를 파일 서비스로 연결한다", async () => {
  const { app } = await testApp([]);
  expect(periodicJobs.get("files.purge_pending")).toEqual({
    name: "files.purge_pending",
    pattern: "0 * * * *",
    tz: "UTC",
  });
  let purged = 0;
  app.get(FilesService).purgePending = () => {
    purged++;
    return Promise.resolve();
  };
  const handler = jobHandlers.get("files.purge_pending");
  if (!handler) throw new Error("정리 잡이 없다");
  await handler({ id: "" }, { attempt: 1 });
  expect(purged).toBe(1);
});
