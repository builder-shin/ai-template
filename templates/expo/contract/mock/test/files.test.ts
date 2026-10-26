/**
 * 파일 API: 만들기(크기·타입·사용자별 한도 검사, meta.upload), 완료 확인(객체와 크기), 내려받기
 * (meta.downloadUrl), 읽기 규칙, 쓰기는 소유자만, 삭제, sparse fieldset. FastAPI 템플릿의
 * files/tests/test_api.py와 같은 경우를 본다.
 */

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { addReadRule } from "../src/modules/files/registry.ts";
import { newUser, send } from "./accounts.ts";
import { codesOf, errorsOf, TIMESTAMP, testApp, testClock } from "./support.ts";
import { createDocument, createFile, FILES, readyDocument, uploadFile } from "./uploads.ts";

const UUID7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ALLOWED = "image/gif, image/jpeg, image/png, image/webp";

describe("만들기", () => {
  it("pending 파일을 만들고 meta.upload에 스토리지로 보낼 PUT 요청을 담는다", async () => {
    const { app, state } = testApp({}, { clock: testClock() });
    const user = await newUser(app, state);
    const created = await createFile(app, user);
    expect(created).toEqual({
      type: "files",
      id: expect.stringMatching(UUID7) as unknown,
      attributes: {
        filename: "cat.png",
        contentType: "image/png",
        size: 4,
        status: "pending",
        createdAt: expect.stringMatching(TIMESTAMP) as unknown,
      },
      relationships: { owner: { data: { type: "users", id: user.userId } } },
      meta: {
        upload: {
          url: expect.stringMatching(
            /^http:\/\/localhost:4010\/_storage\/files\/[\w-]+\?expires=/,
          ) as unknown,
          method: "PUT",
          headers: { "Content-Type": "image/png" },
          expiresAt: expect.stringMatching(TIMESTAMP) as unknown,
        },
      },
    });
    expect(created.meta.upload.url).toContain(`/_storage/files/${created.id}?`);
    const lifetime =
      Date.parse(created.meta.upload.expiresAt) - Date.parse(created.attributes.createdAt);
    expect(lifetime).toBe(15 * 60_000);
    expect(state.store.files.get(created.id)?.status).toBe("pending");
  });

  it.each([
    [{ size: 10 * 1024 * 1024 + 1 }, "file.too_large", "/data/attributes/size"],
    [{ contentType: "application/pdf" }, "file.type_not_allowed", "/data/attributes/contentType"],
    [{ size: 0 }, "validation.out_of_range", "/data/attributes/size"],
    [{ filename: "" }, "validation.too_short", "/data/attributes/filename"],
  ])("크기와 타입을 검사한다: %j", async (attributes, code, pointer) => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const document = createDocument(attributes);
    const response = await send(app, "POST", FILES, { document, token: user.accessToken });
    const errors = await errorsOf(response, 422);
    expect(errors.map((error) => [error.code, error.source])).toEqual([[code, { pointer }]]);
  });

  it("크기, 타입 순서로 먼저 걸린 하나만 알리고, 한도를 meta.params에 담는다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const create = (attributes: Record<string, unknown>) =>
      send(app, "POST", FILES, { document: createDocument(attributes), token: user.accessToken });
    const huge = await create({ size: 10 ** 12, contentType: "application/pdf" });
    expect(await errorsOf(huge, 422)).toEqual([
      {
        status: "422",
        code: "file.too_large",
        title: "Unprocessable Content",
        detail: "A file can be at most 10485760 bytes.",
        source: { pointer: "/data/attributes/size" },
        meta: { params: { max: 10_485_760 } },
      },
    ]);
    const pdf = await create({ contentType: "application/pdf" });
    expect(await errorsOf(pdf, 422)).toEqual([
      {
        status: "422",
        code: "file.type_not_allowed",
        title: "Unprocessable Content",
        detail: `Allowed types are ${ALLOWED}.`,
        source: { pointer: "/data/attributes/contentType" },
        meta: { params: { allowed: ALLOWED } },
      },
    ]);
  });

  it("사용자가 가진 파일 크기의 합이 한도를 넘으면 file.quota_exceeded다", async () => {
    const files = { ...DEFAULT_CONFIG.files, userQuota: 10 };
    const { app, state } = testApp({ files });
    const user = await newUser(app, state);
    await createFile(app, user, { size: 6 });
    const over = await send(app, "POST", FILES, {
      document: createDocument({ size: 5 }),
      token: user.accessToken,
    });
    expect(await errorsOf(over, 422)).toEqual([
      {
        status: "422",
        code: "file.quota_exceeded",
        title: "Unprocessable Content",
        detail: "The files of one user can take at most 10 bytes.",
        source: { pointer: "/data/attributes/size" },
        meta: { params: { quota: 10 } },
      },
    ]);
    await createFile(app, user, { size: 4 });
    await createFile(app, await newUser(app, state), { size: 10 });
  });

  it("로그인하지 않으면 401이다", async () => {
    const { app } = testApp();
    const response = await send(app, "POST", FILES, { document: createDocument() });
    expect(await codesOf(response, 401)).toEqual(["auth.unauthenticated"]);
  });
});

describe("업로드 완료와 내려받기", () => {
  it("올리고 완료를 알리면 ready가 되고 meta.downloadUrl로 내려받는다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const content = Uint8Array.from(Buffer.from("hello"));
    const ready = await uploadFile(app, user, { content, contentType: "image/gif" });
    expect(ready.attributes.status).toBe("ready");
    expect(ready.meta).toEqual({
      downloadUrl: expect.stringMatching(/^http:\/\/localhost:4010\/_storage\/files\//) as unknown,
      downloadUrlExpiresAt: expect.stringMatching(TIMESTAMP) as unknown,
    });
    const downloaded = await app.request(ready.meta?.downloadUrl ?? "");
    expect([downloaded.status, await downloaded.text()]).toEqual([200, "hello"]);
    expect(downloaded.headers.get("content-type")).toBe("image/gif");
    const again = await send(app, "PATCH", `${FILES}/${ready.id}`, {
      document: readyDocument(ready.id),
      token: user.accessToken,
    });
    const { data } = (await again.json()) as { data: { attributes: { status: string } } };
    expect([again.status, data.attributes.status]).toEqual([200, "ready"]);
  });

  it("올리기 전에 완료를 알리면 file.upload_incomplete이고 pending으로 남는다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const created = await createFile(app, user);
    const path = `${FILES}/${created.id}`;
    const token = user.accessToken;
    const response = await send(app, "PATCH", path, { document: readyDocument(created.id), token });
    expect(await errorsOf(response, 422)).toEqual([
      {
        status: "422",
        code: "file.upload_incomplete",
        title: "Unprocessable Content",
        detail: "The object has not been uploaded.",
      },
    ]);
    const current = await send(app, "GET", path, { token });
    const { data } = (await current.json()) as { data: { attributes: { status: string } } };
    expect(data.attributes.status).toBe("pending");
  });

  it("선언과 크기가 다른 객체는 지우고 file.upload_incomplete다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const created = await createFile(app, user, { size: 5 });
    // presigned URL은 다른 크기를 받지 않으므로(스토리지가 403) 버킷에 직접 넣는다.
    const key = `files/${created.id}`;
    state.storage.put(key, { body: Uint8Array.from([1, 2, 3]), contentType: "image/png" });
    const response = await send(app, "PATCH", `${FILES}/${created.id}`, {
      document: readyDocument(created.id),
      token: user.accessToken,
    });
    const [error] = await errorsOf(response, 422);
    expect([error?.code, error?.detail]).toEqual([
      "file.upload_incomplete",
      "The uploaded object has 3 bytes, not the declared 5.",
    ]);
    expect(state.storage.size(key)).toBeUndefined();
  });

  it("data.id가 경로의 파일과 다르면 409다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const created = await createFile(app, user);
    const other = randomUUID();
    const response = await send(app, "PATCH", `${FILES}/${created.id}`, {
      document: readyDocument(other),
      token: user.accessToken,
    });
    const errors = await errorsOf(response, 409);
    expect(errors.map((error) => [error.code, error.source, error.detail])).toEqual([
      [
        "resource.conflict",
        { pointer: "/data/id" },
        `data.id ${other} does not match the resource ${created.id}.`,
      ],
    ]);
  });
});

describe("읽기와 쓰기", () => {
  it("소유자만 보고 고친다. 남의 파일과 없는 파일은 404다", async () => {
    const { app, state } = testApp();
    const owner = await newUser(app, state);
    const other = await newUser(app, state);
    const file = await uploadFile(app, owner);
    const path = `${FILES}/${file.id}`;
    const responses = [
      await send(app, "GET", path, { token: other.accessToken }),
      await send(app, "GET", path),
      await send(app, "PATCH", path, {
        document: readyDocument(file.id),
        token: other.accessToken,
      }),
      await send(app, "DELETE", path, { token: other.accessToken }),
      await send(app, "GET", `${FILES}/${randomUUID()}`, { token: owner.accessToken }),
    ];
    for (const response of responses) {
      expect(await codesOf(response, 404)).toEqual(["resource.not_found"]);
    }
    const [notFound] = await errorsOf(await send(app, "GET", path), 404);
    expect(notFound?.detail).toBe(`File ${file.id} does not exist.`);
    expect((await send(app, "GET", path, { token: owner.accessToken })).status).toBe(200);
  });

  it("읽기 규칙이 허용하면 남도 읽지만, 고치고 지우는 것은 소유자만 한다(403)", async () => {
    const { app, state } = testApp();
    addReadRule(state.fileRegistry, () => true);
    const owner = await newUser(app, state);
    const other = await newUser(app, state);
    const file = await uploadFile(app, owner);
    const path = `${FILES}/${file.id}`;
    const anonymous = await send(app, "GET", path);
    const { data } = (await anonymous.json()) as { data: { meta: Record<string, unknown> } };
    expect(Object.keys(data.meta)).toEqual(["downloadUrl", "downloadUrlExpiresAt"]);
    // 고칠 속성이 없는 PATCH도 소유자만 한다(속성을 보기 전에 소유자인지 본다).
    const noAttributes = { data: { type: "files", id: file.id } };
    const emptyAttributes = { data: { type: "files", id: file.id, attributes: {} } };
    const token = other.accessToken;
    const changes = [
      await send(app, "PATCH", path, { document: readyDocument(file.id), token }),
      await send(app, "PATCH", path, { document: noAttributes, token }),
      await send(app, "PATCH", path, { document: emptyAttributes, token }),
      await send(app, "DELETE", path, { token }),
    ];
    for (const response of changes) {
      expect(await errorsOf(response, 403)).toEqual([
        {
          status: "403",
          code: "permission.denied",
          title: "Forbidden",
          detail: "Only the owner can change this file.",
        },
      ]);
    }
    const mine = await send(app, "PATCH", path, {
      document: noAttributes,
      token: owner.accessToken,
    });
    const body = (await mine.json()) as { data: { attributes: { status: string } } };
    expect([mine.status, body.data.attributes.status]).toEqual([200, "ready"]);
  });

  it("지우면 행과 객체가 사라진다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const file = await uploadFile(app, user);
    const path = `${FILES}/${file.id}`;
    const response = await send(app, "DELETE", path, { token: user.accessToken });
    expect([response.status, await response.text()]).toEqual([204, ""]);
    expect((await send(app, "GET", path, { token: user.accessToken })).status).toBe(404);
    expect(state.storage.size(`files/${file.id}`)).toBeUndefined();
    const download = await app.request(file.meta?.downloadUrl ?? "");
    expect(download.status).toBe(404);
  });

  it("fields[files]로 속성을 고른다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const file = await uploadFile(app, user);
    const response = await send(app, "GET", `${FILES}/${file.id}?fields%5Bfiles%5D=filename`, {
      token: user.accessToken,
    });
    const { data } = (await response.json()) as { data: Record<string, unknown> };
    expect(data.attributes).toEqual({ filename: "image.png" });
    expect(data.relationships).toEqual({});
  });
});
