import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { io } from "socket.io-client";
import { base, object, string, request, wait, mailLink } from "./http.js";
import { start, stopAll } from "../../scripts/servers.js";
import { e2eEnvironment } from "../../scripts/e2e-options.js";

const email = `process-${randomUUID()}@example.com`;
const password = "process-boundary-password"; // betterleaks:allow test-only password
const registration = await request("/registrations", "POST", {
  type: "registrations",
  attributes: { email, password, name: "Process boundary", locale: "en" },
});
assert.equal(registration.response.status, 201);
const link = await mailLink(email);
const verified = await request("/email-verifications", "POST", {
  type: "email-verifications",
  attributes: { token: new URL(link).searchParams.get("token") },
});
assert.equal(verified.response.status, 201);
const login = await request("/sessions", "POST", {
  type: "sessions",
  attributes: { grantType: "password", email, password },
});
assert.equal(login.response.status, 201);
const session = object(object(login.body).data),
  token = string(object(session.attributes).accessToken);
const me = await request("/me", "GET", undefined, token);
assert.equal(me.response.status, 200);
const userId = string(object(object(me.body).data).id);
const socket = io(base, {
  transports: ["websocket"],
  reconnection: false,
  extraHeaders: { Origin: process.env.E2E_WEB_URL ?? "" },
});
const events: unknown[] = [];
socket.on("post.published", (event: unknown) => events.push(event));
try {
  await new Promise<void>((done, reject) => {
    socket.once("connect", done);
    socket.once("connect_error", reject);
  });
  const ack: unknown = await socket.timeout(5000).emitWithAck("subscribe", { channel: "posts" });
  assert.deepEqual(ack, { ok: true });
  const created = await request(
    "/posts",
    "POST",
    { type: "posts", attributes: { title: "Process event", body: "Body", status: "draft" } },
    token,
  );
  assert.equal(created.response.status, 201);
  const id = string(object(object(created.body).data).id);
  assert.equal(
    (
      await request(
        `/posts/${id}`,
        "PATCH",
        { type: "posts", id, attributes: { status: "published" } },
        token,
      )
    ).response.status,
    200,
  );
  await wait(
    () => Promise.resolve(events),
    (values) => values.some((v) => object(object(v).data).id === id),
  );
  const draft = await request(
    "/posts",
    "POST",
    { type: "posts", attributes: { title: "Worker publication", body: "Body", status: "draft" } },
    token,
  );
  assert.equal(draft.response.status, 201);
  const workerId = string(object(object(draft.body).data).id);
  const workerEnvironment = e2eEnvironment(
    process.env.E2E_WEB_URL ?? "http://localhost:3000",
    process.env,
  ).server;
  const worker = start(
    [process.execPath, resolve(import.meta.dirname, "publish.mjs"), userId, workerId],
    workerEnvironment,
    resolve(import.meta.dirname, "../.."),
    "e2e-worker-publish",
  );
  try {
    const code = await worker.exited;
    let message = "Worker context must commit publication.";
    if (code !== 0) {
      let tail = worker.tail.replaceAll(password, "[redacted]");
      for (const key of [
        "E2E_SEED_ADMIN_PASSWORD",
        "SEED_ADMIN_PASSWORD",
        "JWT_SECRET",
        "IDENTIFIER_HASH_SECRET",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
        "DATABASE_URL",
        "REDIS_URL",
        "SMTP_URL",
      ]) {
        for (const environment of [workerEnvironment, process.env]) {
          const value = environment[key];
          if (value) tail = tail.replaceAll(value, "[redacted]");
        }
      }
      message += `\nWorker log tail:\n${tail.slice(-8192)}`;
    }
    assert.equal(code, 0, message);
    await wait(
      () => Promise.resolve(events),
      (values) => values.some((v) => object(object(v).data).id === workerId),
    );
  } finally {
    await stopAll([worker]);
  }
  const bytes = Buffer.from("process-boundary-upload");
  const fileCreated = await request(
    "/files",
    "POST",
    {
      type: "files",
      attributes: { filename: "probe.png", contentType: "image/png", size: bytes.length },
    },
    token,
  );
  assert.equal(fileCreated.response.status, 201);
  const file = object(object(fileCreated.body).data),
    fileId = string(file.id),
    upload = object(object(file.meta).upload);
  const put = await fetch(string(upload.url), {
    method: "PUT",
    headers: object(upload.headers) as Record<string, string>,
    body: bytes,
    signal: AbortSignal.timeout(5000),
  });
  await put.arrayBuffer();
  assert.equal(put.ok, true);
  const completed = await request(
    `/files/${fileId}`,
    "PATCH",
    { type: "files", id: fileId, attributes: { status: "ready" } },
    token,
  );
  assert.equal(completed.response.status, 200);
  const ready = object(object(completed.body).data);
  assert.equal(object(ready.attributes).status, "ready");
  const download = await fetch(string(object(ready.meta).downloadUrl), {
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  console.log(
    JSON.stringify({
      processFlows: {
        registration: 201,
        verified: 201,
        login: 201,
        workerMailOrigin: new URL(link).origin,
        apiPublished: true,
        workerPublished: true,
        upload: true,
        downloadBytes: bytes.length,
      },
    }),
  );
} finally {
  socket.close();
}
