/**
 * 업로드 도우미: 파일 API로 파일을 만들고 meta.upload의 presigned 요청으로 가짜 스토리지에 올린다
 * (FastAPI 테스트의 app/tests/uploads.py). app.request는 네트워크를 거치지 않아 Content-Length를
 * 붙이지 않으므로, 브라우저처럼 본문 길이를 직접 붙인다.
 */

import type { Hono } from "hono";
import { expect } from "vitest";
import type { AppEnv } from "../src/context.ts";
import type { CreatedFileResource, FileResource } from "../src/modules/files/documents.ts";
import { type SignedIn, send } from "./accounts.ts";

type App = Hono<AppEnv>;

export const FILES = "/api/v1/files";
/** 올리는 이미지(FastAPI 테스트의 PNG와 같은 바이트). */
export const PNG = Uint8Array.from(Buffer.from("\x89PNG\r\n\x1a\n-test-image", "latin1"));

export type UploadRequest = CreatedFileResource["meta"]["upload"];

export function createDocument(attributes: Record<string, unknown> = {}) {
  const values = { filename: "cat.png", contentType: "image/png", size: 4, ...attributes };
  return { data: { type: "files", attributes: values } };
}

export function readyDocument(fileId: string) {
  return { data: { type: "files", id: fileId, attributes: { status: "ready" } } };
}

/** presigned 요청을 보낸다. headers를 주지 않으면 meta.upload의 헤더를 그대로 붙인다. */
export function putObject(
  app: App,
  upload: UploadRequest,
  body: Uint8Array<ArrayBuffer>,
  headers: Readonly<Record<string, string>> = upload.headers,
): Promise<Response> {
  const init = {
    method: upload.method,
    body,
    headers: { ...headers, "Content-Length": String(body.byteLength) },
  };
  return Promise.resolve(app.request(upload.url, init));
}

/** 파일을 만든다(201이어야 한다). */
export async function createFile(
  app: App,
  user: SignedIn,
  attributes: Record<string, unknown> = {},
): Promise<CreatedFileResource> {
  const response = await send(app, "POST", FILES, {
    document: createDocument(attributes),
    token: user.accessToken,
  });
  expect(response.status, await response.clone().text()).toBe(201);
  return ((await response.json()) as { data: CreatedFileResource }).data;
}

export interface UploadOptions {
  readonly content?: Uint8Array<ArrayBuffer>;
  readonly contentType?: string;
  readonly filename?: string;
  /** 업로드를 마쳤다고 알릴지(기본 true). false면 올리기만 하고 pending으로 둔다. */
  readonly ready?: boolean;
}

/**
 * 파일을 만들고 올린다. ready면 완료까지 알린다. 마지막 응답의 파일 리소스(ready가 아니면 만들 때의
 * 리소스)를 돌려준다.
 */
export async function uploadFile(
  app: App,
  user: SignedIn,
  options: UploadOptions = {},
): Promise<FileResource | CreatedFileResource> {
  const content = options.content ?? PNG;
  const created = await createFile(app, user, {
    filename: options.filename ?? "image.png",
    contentType: options.contentType ?? "image/png",
    size: content.byteLength,
  });
  const put = await putObject(app, created.meta.upload, content);
  expect(put.status, await put.clone().text()).toBe(200);
  if (options.ready === false) return created;
  const path = `${FILES}/${created.id}`;
  const done = await send(app, "PATCH", path, {
    document: readyDocument(created.id),
    token: user.accessToken,
  });
  expect(done.status, await done.clone().text()).toBe(200);
  return ((await done.json()) as { data: FileResource }).data;
}
