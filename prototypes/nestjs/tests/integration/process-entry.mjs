import { createApp } from "../../dist/main.js";
import { worker } from "../../dist/worker.js";
import { scheduler } from "../../dist/scheduler.js";
import { RealtimeService } from "../../dist/modules/realtime/index.js";
import { RuntimeRealtimePublisher } from "../../dist/core/realtime/emitter.js";
import { RedisClients } from "../../dist/core/redis/clients.js";
import { JobQueue } from "../../dist/core/jobs/queue.js";
import { UnitOfWork } from "../../dist/core/db/unit-of-work.js";
const mode = process.argv[2];
const warnings = [];
process.on("warning", (warning) => {
  if (warning.name === "MaxListenersExceededWarning") warnings.push(warning.message);
});
let app;
if (mode === "api") {
  app = await createApp(undefined, true);
  app.useLogger(false);
  await app.listen(0, "127.0.0.1");
  await app.get(RealtimeService).start();
} else if (mode === "worker") {
  app = await worker(
    (job) =>
      process.send({
        type: "attempt",
        id: job.id,
        name: job.name,
        attempt: job.attemptsMade + 1,
        at: Date.now(),
        data: job.data,
      }),
    (context) => {
      context.get(JobQueue).backoffObserver = (observation) =>
        process.send({ type: "backoff", ...observation });
      context.get(JobQueue).register("realtime.scheduler_tick", async ({ id }) => {
        await context.get(RedisClients).command.incr(`${context.get(RedisClients).prefix}:ticks`);
        process.send({ type: "tick", id, at: Date.now() });
      });
      context.get(JobQueue).register("realtime.probe_emit", async ({ id }) => {
        await context.get(UnitOfWork).run(async (_tx, afterCommit) => {
          context
            .get(RuntimeRealtimePublisher)
            .queue(afterCommit, "post.deleted", ["posts", "posts:all"], () => ({
              data: { type: "posts", id },
            }));
        });
      });
    },
  );
} else if (mode === "scheduler") app = await scheduler();
else throw new Error("Unknown child mode.");
process.send({
  type: "ready",
  mode,
  pid: process.pid,
  url: mode === "api" ? await app.getUrl() : null,
});
let closing = false;
process.on("message", async (message) => {
  if (message.type === "close" && !closing) {
    closing = true;
    await app.close();
    process.send({ type: "closed", mode, pid: process.pid, warnings });
    process.disconnect();
  } else if (message.type === "disconnect-command" && mode === "api") {
    app.get(RedisClients).command.disconnect();
    process.send({ type: "command-disconnected" });
  } else if (message.type === "recheck" && mode === "api") {
    await app.get(RealtimeService).recheck(message.userId);
    process.send({ type: "rechecked" });
  }
});
