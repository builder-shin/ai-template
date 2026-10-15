import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { expect, it } from "vitest";
import { io } from "socket.io-client";
import { z } from "zod";
import { startProcessTree, stopProcessTree } from "../../scripts/process-tree.mjs";
import { environment } from "../../scripts/child-environment.mjs";
import { e2eEnvironment } from "../../scripts/e2e-options.js";
import { api, messagesFor, resource, verificationToken } from "./http.js";

it("가입과 메일 인증과 로그인 뒤 별도 worker의 발행 commit·Socket.IO와 23바이트 업로드를 확인한다", async () => {
  const email = `${randomUUID()}@example.test`;
  const password = "e2e-fixture-password-123"; // betterleaks:allow 사유: CI 가입 가짜 비밀번호
  const registered = await api("registrations", {
    method: "POST",
    data: {
      type: "registrations",
      attributes: { email, password, name: "E2E 회원", locale: "ko" },
    },
  });
  expect(registered.status).toBe(201);
  await expect.poll(() => verificationToken(email), { timeout: 15000 }).toBeTypeOf("string");
  expect((await messagesFor(email)).map((mail) => mail.Subject)).toEqual([
    "이메일을 인증해 주세요",
  ]);
  const verified = await api("email-verifications", {
    method: "POST",
    data: { type: "email-verifications", attributes: { token: await verificationToken(email) } },
  });
  expect(verified.status).toBe(201);
  await expect
    .poll(async () => (await messagesFor(email)).map((mail) => mail.Subject).sort(), {
      timeout: 15000,
    })
    .toEqual(["가입을 환영합니다", "이메일을 인증해 주세요"]);
  const login = await api("sessions", {
    method: "POST",
    data: { type: "sessions", attributes: { grantType: "password", email, password } },
  });
  expect(login.status).toBe(201);
  const session = z
    .object({
      data: z.object({ id: z.string(), attributes: z.object({ accessToken: z.string() }) }),
    })
    .parse(login.body).data;
  const token = session.attributes.accessToken;
  const me = await api("me", { token });
  expect(me.status).toBe(200);
  const userId = resource.parse(me.body).data.id;
  const draft = await api("posts", {
    method: "POST",
    token,
    data: { type: "posts", attributes: { title: "별도 worker 발행", body: "commit 뒤 보인다" } },
  });
  expect(draft.status).toBe(201);
  const postId = resource.parse(draft.body).data.id;
  const socket = io(environment().E2E_API_URL ?? "http://127.0.0.1:18000", {
    transports: ["websocket"],
    autoConnect: false,
    reconnection: false,
  });
  let deliveryTimer: NodeJS.Timeout | undefined;
  try {
    await new Promise<void>((yes, no) => {
      socket.once("connect", yes);
      socket.once("connect_error", no);
      socket.connect();
    });
    const ack: unknown = await socket.timeout(5000).emitWithAck("subscribe", { channel: "posts" });
    expect(ack).toEqual({ ok: true });
    const delivered = new Promise<{ payload: unknown; committed: number }>((yes, no) => {
      deliveryTimer = setTimeout(() => {
        no(new Error("발행 이벤트 한도를 넘겼다"));
      }, 15000);
      socket.once("post.published", (payload: unknown) => {
        void api(`posts/${postId}`).then((response) => {
          yes({ payload, committed: response.status });
        }, no);
      });
    });
    void delivered.catch(() => {});
    const child = startProcessTree(
      [
        "--import",
        "./dist/core/telemetry/register.js",
        "tests/e2e/publish.mjs",
        postId,
        userId,
        session.id,
      ],
      {
        cwd: process.cwd(),
        stdio: "inherit",
        env: e2eEnvironment(environment().E2E_WEB_URL ?? "http://localhost:3000", environment())
          .server,
      },
    );
    try {
      expect((await once(child, "exit"))[0]).toBe(0);
    } finally {
      await stopProcessTree(child);
    }
    const event = await delivered;
    expect(event.committed).toBe(200);
    expect(resource.parse(event.payload).data.id).toBe(postId);
    expect(resource.parse((await api(`posts/${postId}`)).body).data.attributes.status).toBe(
      "published",
    );
  } finally {
    clearTimeout(deliveryTimer);
    socket.disconnect();
  }
  const bytes = Buffer.from("01234567890123456789012");
  const created = await api("files", {
    method: "POST",
    token,
    data: {
      type: "files",
      attributes: { filename: "e2e.png", contentType: "image/png", size: bytes.length },
    },
  });
  expect(created.status).toBe(201);
  const file = resource.parse(created.body).data;
  const upload = z
    .object({ url: z.string(), headers: z.record(z.string(), z.string()) })
    .parse(file.meta?.upload);
  expect(
    (
      await fetch(upload.url, {
        method: "PUT",
        headers: upload.headers,
        body: bytes,
        signal: AbortSignal.timeout(10000),
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await api(`files/${file.id}`, {
        method: "PATCH",
        token,
        data: { type: "files", id: file.id, attributes: { status: "ready" } },
      })
    ).status,
  ).toBe(200);
  const read = await api(`files/${file.id}`, { token });
  expect(read.status).toBe(200);
  const url = z.string().parse(resource.parse(read.body).data.meta?.downloadUrl);
  const download = await fetch(url, { signal: AbortSignal.timeout(10000) });
  expect(download.status).toBe(200);
  expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);
});
