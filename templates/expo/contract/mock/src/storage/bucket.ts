/**
 * 가짜 스토리지의 버킷(FastAPI 템플릿의 core/storage.py가 다루는 S3 호환 버킷, 개발은 SeaweedFS).
 * 객체는 프로세스 메모리에 있고, 브라우저는 presigned URL로 목의 /_storage/<키>에 직접 올리고
 * 내려받는다(routes.ts). 모듈(files)은 FastAPI의 Storage처럼 presign, size(HEAD), delete로 다룬다.
 *
 * - presigned URL은 <API_URL>/_storage/<키>?expires=<Unix 초>&signature=<서명>이다. 서명은 프로세스를
 *   띄울 때 만든 키의 HMAC-SHA256이라 재시작하면 옛 URL은 맞지 않는다(객체도 함께 사라진다).
 * - FastAPI의 SigV4 presign처럼 메서드, 키, 만료를 서명한다. 업로드(PUT)는 Content-Type과
 *   Content-Length도 서명해서, 선언과 다른 타입이나 크기의 본문은 서명이 맞지 않아 거절된다.
 * - 업로드 요청에 붙일 헤더(headers)는 FastAPI와 같이 Content-Type 하나다. Content-Length는 브라우저가
 *   본문으로 정한다.
 * - 만료는 FastAPI(S3)처럼 초 단위로 버린 시각까지다. 응답의 expiresAt은 마이크로초까지 적는다.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { type Clock, type Instant, SECOND } from "../core/clock.ts";

/** 가짜 스토리지가 뜨는 경로. */
export const STORAGE_PATH = "/_storage";

export interface StoredObject {
  readonly body: Uint8Array<ArrayBuffer>;
  readonly contentType: string;
}

/** 브라우저가 스토리지에 직접 보낼 요청. headers는 요청에 그대로 붙여야 하는 헤더다. */
export interface PresignedRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly expiresAt: Instant;
}

/** 업로드 URL이 서명하는 본문의 타입과 크기(바이트). */
export interface UploadSpec {
  readonly contentType: string;
  readonly size: number;
}

/** 스토리지가 받은 요청 가운데 서명을 확인할 값. 요청에 없는 값은 undefined다. */
export interface ReceivedRequest {
  readonly method: string;
  readonly key: string;
  readonly expires: string | undefined;
  readonly signature: string | undefined;
  readonly contentType: string | undefined;
  readonly contentLength: string | undefined;
}

/** 받은 요청이 presigned URL과 맞는가. invalid는 서명이 없거나 맞지 않는 것이다. */
export type SignatureCheck = "valid" | "expired" | "invalid";

export interface Storage {
  /** PUT 업로드 URL. 브라우저는 headers를 붙이고 정확히 size바이트를 보낸다. expires는 수명이다. */
  presignUpload(
    baseUrl: string,
    key: string,
    upload: UploadSpec,
    expires: number,
  ): PresignedRequest;
  /** GET 다운로드 URL. expires는 수명이다. */
  presignDownload(baseUrl: string, key: string, expires: number): PresignedRequest;
  /** 받은 요청의 서명과 만료를 확인한다. */
  check(request: ReceivedRequest): SignatureCheck;
  put(key: string, object: StoredObject): void;
  get(key: string): StoredObject | undefined;
  /** 객체의 크기(FastAPI의 size, HEAD). 객체가 없으면 undefined다. */
  size(key: string): number | undefined;
  /** 객체를 지운다. 없어도 에러가 아니다. */
  delete(key: string): void;
}

/** 서명할 문자열: 메서드, 키, 만료(Unix 초)와 서명하는 헤더의 값. */
function canonical(
  method: string,
  key: string,
  expires: string,
  signed: readonly string[],
): string {
  return [method, key, expires, ...signed].join("\n");
}

/** 서명하는 헤더의 값. 업로드(PUT)만 본문의 타입과 크기를 서명한다. */
function signedHeaders(method: string, contentType: string, contentLength: string): string[] {
  return method === "PUT" ? [contentType, contentLength] : [];
}

/** URL 경로의 키. 조각마다 퍼센트 인코딩한다. */
function keyPath(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

export function createStorage(clock: Clock): Storage {
  const signingKey = randomBytes(32);
  const objects = new Map<string, StoredObject>();

  function sign(text: string): string {
    return createHmac("sha256", signingKey).update(text, "utf8").digest("hex");
  }

  function presign(
    baseUrl: string,
    method: "GET" | "PUT",
    key: string,
    headers: Readonly<Record<string, string>>,
    signed: readonly string[],
    expires: number,
  ): PresignedRequest {
    const expiresAt = clock.now() + expires;
    const seconds = String(Math.floor(expiresAt / SECOND));
    const signature = sign(canonical(method, key, seconds, signed));
    const query = new URLSearchParams({ expires: seconds, signature });
    const url = `${baseUrl.replace(/\/+$/, "")}${STORAGE_PATH}/${keyPath(key)}?${query.toString()}`;
    return { url, headers, expiresAt };
  }

  return {
    presignUpload(baseUrl, key, upload, expires) {
      const headers = { "Content-Type": upload.contentType };
      const signed = signedHeaders("PUT", upload.contentType, String(upload.size));
      return presign(baseUrl, "PUT", key, headers, signed, expires);
    },
    presignDownload(baseUrl, key, expires) {
      return presign(baseUrl, "GET", key, {}, [], expires);
    },
    check(request) {
      const { method, key, expires, signature } = request;
      if (expires === undefined || signature === undefined || !/^\d+$/.test(expires)) {
        return "invalid";
      }
      const contentType = request.contentType?.trim() ?? "";
      const signed = signedHeaders(method, contentType, request.contentLength?.trim() ?? "");
      const expected = Buffer.from(sign(canonical(method, key, expires, signed)));
      const given = Buffer.from(signature);
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) return "invalid";
      return clock.now() > Number(expires) * SECOND ? "expired" : "valid";
    },
    put(key, object) {
      objects.set(key, object);
    },
    get(key) {
      return objects.get(key);
    },
    size(key) {
      return objects.get(key)?.body.byteLength;
    },
    delete(key) {
      objects.delete(key);
    },
  };
}
