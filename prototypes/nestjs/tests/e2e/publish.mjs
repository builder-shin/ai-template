// Test-only process: run the installed worker context and real domain event publisher.
import { worker } from "../../dist/worker.js";
import { PostsService } from "../../dist/modules/posts/index.js";
import { registerDomain } from "../../dist/modules/registry.js";
const [userId, id] = process.argv.slice(2);
let stage = "bootstrap";
process.once("exit", (code) => {
  if (code !== 0) console.error(`Worker publication failed at ${stage}.`);
});
const app = await worker();
try {
  stage = "register";
  registerDomain(app);
  stage = "update";
  const result = await app
    .get(PostsService)
    .update({ userId, permissions: new Set(["posts:create"]), sessionId: "test-only" }, id, {
      type: "posts",
      id,
      attributes: { status: "published" },
    });
  if (result.data.attributes.status !== "published") throw new Error("Worker publication failed.");
  console.log(JSON.stringify({ committed: true }));
  stage = "close";
} finally {
  await app.close();
}
