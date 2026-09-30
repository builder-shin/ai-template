/**
 * 요청 본문의 짝 없는 서로게이트. 기대값은 FastAPI 템플릿에 같은 요청을 보내 얻은 응답이다. Pydantic은
 * 값을 파싱하는 문자열(길이 제약, 선택지)에 짝 없는 서로게이트가 있으면 다른 검사보다 먼저 오류를 내고,
 * 제약 없는 문자열은 받는다. JSON 이스케이프와 UTF-8로 인코딩한 서로게이트 바이트는 같게 읽는다
 * (Python json.loads의 surrogatepass).
 */

import { describe, expect, it } from "vitest";
import type { ErrorObject } from "../src/jsonapi/errors.ts";
import { JSONAPI_MEDIA_TYPE } from "../src/jsonapi/media.ts";
import { decodeBody } from "../src/jsonapi/surrogates.ts";
import {
  isRequestDocumentName,
  readJsonBody,
  validateDocument,
} from "../src/jsonapi/validation.ts";
import { errorsOf, testApp } from "./support.ts";

const UNICODE = "Input should be a valid string, unable to parse raw data as a unicode string";
const ID = "01920000-0000-7000-8000-000000000001";
const PASSWORD = "conformance-password"; // betterleaks:allow 테스트용 가짜 비밀번호
const REGISTRATION = { email: "someone@example.com", password: PASSWORD, name: "누군가" };
const TAGS = "expected tags: 'password', 'refreshToken', 'oauthCode'";
/** 짝 없는 서로게이트 하나(U+D800). */
const LONE = "\ud800";
/** UTF-8로 인코딩한 서로게이트 U+D800, U+DFFF. */
const RAW_D800 = [0xed, 0xa0, 0x80];
const RAW_DFFF = [0xed, 0xbf, 0xbf];

/** 요청 문서를 검증해 돌려주는 시험용 라우트(FastAPI 쪽은 같은 모델을 본문으로 받는 라우트). */
function validatingApp() {
  const { app } = testApp();
  app.post("/api/v1/probe/:schema", async (c) => {
    const name = c.req.param("schema");
    if (!isRequestDocumentName(name)) throw new Error(`요청 문서가 아니다: ${name}`);
    return c.json(validateDocument(name, await readJsonBody(c)));
  });
  return app;
}

const app = validatingApp();

async function send(schema: string, body: string | Uint8Array): Promise<Response> {
  return app.request(`/api/v1/probe/${schema}`, {
    method: "POST",
    body,
    headers: { "Content-Type": JSONAPI_MEDIA_TYPE, Accept: JSONAPI_MEDIA_TYPE },
  });
}

async function accepted(schema: string, body: string | Uint8Array): Promise<unknown> {
  const response = await send(schema, body);
  expect(response.status, await response.clone().text()).toBe(200);
  return response.json();
}

function create(type: string, attributes: unknown, data: Record<string, unknown> = {}): string {
  return JSON.stringify({ data: { type, attributes, ...data } });
}

/** 본문 JSON의 "@@" 자리에 raw 바이트를 넣는다. */
function withBytes(json: string, raw: readonly number[]): Uint8Array {
  const [before = "", after = ""] = json.split("@@");
  return Uint8Array.from([...Buffer.from(before), ...raw, ...Buffer.from(after)]);
}

function field(code: ErrorObject["code"], pointer: string, detail: string): ErrorObject {
  return { status: "422", code, title: "Unprocessable Content", detail, source: { pointer } };
}

const unreadable = (pointer: string) => field("validation.invalid_format", pointer, UNICODE);

describe("값을 파싱하는 문자열(길이 제약, 선택지)", () => {
  it.each([
    ["가입 비밀번호", "RegistrationCreateDocument", "password", { password: `${PASSWORD}\ud800` }],
    [
      "가입 이름(앞뒤 공백을 지우기 전)",
      "RegistrationCreateDocument",
      "name",
      { name: " \udc00 " },
    ],
    ["가입 로케일(선택지)", "RegistrationCreateDocument", "locale", { locale: "ko\ud800" }],
  ])("%s: 422 validation.invalid_format이다", async (_label, schema, name, attributes) => {
    const body = create("registrations", { ...REGISTRATION, ...attributes });
    expect(await errorsOf(await send(schema, body), 422)).toEqual([
      unreadable(`/data/attributes/${name}`),
    ]);
  });

  it.each([
    [
      "재설정 비밀번호",
      "PasswordResetCreateDocument",
      "password-resets",
      { token: "t", password: LONE },
      "/data/attributes/password",
    ],
    [
      "새 비밀번호",
      "PasswordChangeCreateDocument",
      "password-changes",
      { currentPassword: "x", newPassword: LONE },
      "/data/attributes/newPassword",
    ],
    [
      "역할 이름",
      "RoleCreateDocument",
      "roles",
      { name: LONE, permissions: [] },
      "/data/attributes/name",
    ],
    [
      "권한(배열 원소의 선택지)",
      "RoleCreateDocument",
      "roles",
      { name: "r", permissions: [LONE] },
      "/data/attributes/permissions/0",
    ],
    ["글 제목", "PostCreateDocument", "posts", { title: LONE, body: "" }, "/data/attributes/title"],
    ["글 본문", "PostCreateDocument", "posts", { title: "t", body: LONE }, "/data/attributes/body"],
    [
      "파일 이름",
      "FileCreateDocument",
      "files",
      { filename: "a\ud800.png", contentType: "image/png", size: 1 },
      "/data/attributes/filename",
    ],
  ])("%s도 같다", async (_label, schema, type, attributes, pointer) => {
    expect(await errorsOf(await send(schema, create(type, attributes)), 422)).toEqual([
      unreadable(pointer),
    ]);
  });

  it("관계의 type과 수정 요청의 선택지도 같다", async () => {
    const cover = { coverImage: { data: { type: LONE, id: ID } } };
    const post = create("posts", { title: "t", body: "" }, { relationships: cover });
    expect(await errorsOf(await send("PostCreateDocument", post), 422)).toEqual([
      unreadable("/data/relationships/coverImage/data/type"),
    ]);
    const roles = { roles: { data: [{ type: "roles\udfff", id: ID }] } };
    const user = JSON.stringify({
      data: { type: "users", id: ID, attributes: { status: LONE }, relationships: roles },
    });
    expect(await errorsOf(await send("UserUpdateDocument", user), 422)).toEqual([
      unreadable("/data/attributes/status"),
      unreadable("/data/relationships/roles/data/0/type"),
    ]);
  });

  it("길이 검사보다 먼저 보고, 필드마다 모델의 필드 순서로 알린다", async () => {
    const attributes = { ...REGISTRATION, password: `${"p".repeat(200)}\udfff`, name: LONE };
    const body = create("registrations", attributes);
    expect(await errorsOf(await send("RegistrationCreateDocument", body), 422)).toEqual([
      unreadable("/data/attributes/password"),
      unreadable("/data/attributes/name"),
    ]);
  });

  it("data.type이면 409가 아니라 400 jsonapi.invalid_document다", async () => {
    const body = create("registrations\ud800", REGISTRATION);
    expect(await errorsOf(await send("RegistrationCreateDocument", body), 400)).toEqual([
      {
        status: "400",
        code: "jsonapi.invalid_document",
        title: "Bad Request",
        detail: UNICODE,
        source: { pointer: "/data/type" },
      },
    ]);
  });
});

describe("제약 없는 문자열은 그대로 받는다", () => {
  it.each([
    [
      "인증 토큰",
      "EmailVerificationCreateDocument",
      create("email-verifications", { token: LONE }),
    ],
    [
      "로그인 비밀번호",
      "SessionCreateDocument",
      create("sessions", { grantType: "password", email: "a@example.com", password: LONE }),
    ],
    [
      "refresh token",
      "SessionCreateDocument",
      create("sessions", { grantType: "refreshToken", refreshToken: "\udc00" }),
    ],
    [
      "현재 비밀번호",
      "PasswordChangeCreateDocument",
      create("password-changes", { currentPassword: LONE, newPassword: PASSWORD }),
    ],
    [
      "파일 콘텐츠 타입",
      "FileCreateDocument",
      create("files", { filename: "a.png", contentType: "image/\ud800", size: 1 }),
    ],
    [
      "역할 설명(길이만 따로 센다)",
      "RoleCreateDocument",
      create("roles", { name: "r", description: LONE, permissions: [] }),
    ],
    [
      "관계의 id",
      "PostCreateDocument",
      create(
        "posts",
        { title: "t", body: "" },
        { relationships: { coverImage: { data: { type: "files", id: LONE } } } },
      ),
    ],
    [
      "수정 요청의 data.id",
      "UserMeUpdateDocument",
      JSON.stringify({ data: { type: "users", id: LONE, attributes: {} } }),
    ],
  ])("%s", async (_label, schema, body) => {
    expect(await accepted(schema, body)).toEqual(JSON.parse(body));
  });
});

describe("메시지", () => {
  it("판별자 값의 짝 없는 서로게이트는 U+FFFD 셋으로 적는다", async () => {
    const body = create("sessions", { grantType: "\udc00x\ud800" });
    const shown = "\ufffd\ufffd\ufffdx\ufffd\ufffd\ufffd";
    const detail = `Input tag '${shown}' found using 'grant_type' | 'grantType' does not match any of the ${TAGS}`;
    expect(await errorsOf(await send("SessionCreateDocument", body), 422)).toEqual([
      field("validation.invalid_choice", "/data/attributes/grantType", detail),
    ]);
  });

  it.each([
    ["@ 앞을 먼저 본다", "us\ud800er@exa\udc00mple.com", "contains unsafe characters: U+D800."],
    [
      "겹치지 않게 정렬한다",
      " \udfffa\udfff\ud800@example.com ",
      "contains unsafe characters: U+D800, U+DFFF.",
    ],
    ["마침표 검사보다 먼저다", "user@exa\ud800mple", "contains unsafe characters: U+D800."],
    ["@가 없으면 그 문구다", LONE, "must have an @-sign."],
  ])("이메일의 짝 없는 서로게이트: %s", async (_label, email, reason) => {
    const body = create("registrations", { ...REGISTRATION, email });
    const [error] = await errorsOf(await send("RegistrationCreateDocument", body), 422);
    const prefix = reason.startsWith("must") ? "An email address" : "The email address";
    expect(error?.detail).toBe(`value is not a valid email address: ${prefix} ${reason}`);
  });
});

describe("본문 바이트", () => {
  it("UTF-8로 인코딩한 서로게이트 바이트는 JSON 이스케이프와 같다", async () => {
    const name = create("registrations", { ...REGISTRATION, name: "@@" });
    expect(
      await errorsOf(await send("RegistrationCreateDocument", withBytes(name, RAW_D800)), 422),
    ).toEqual([unreadable("/data/attributes/name")]);
    const token = create("email-verifications", { token: "@@" });
    expect(await accepted("EmailVerificationCreateDocument", withBytes(token, RAW_DFFF))).toEqual({
      data: { type: "email-verifications", attributes: { token: "\udfff" } },
    });
  });

  it("서로게이트가 아닌 ED 바이트(한글)와 중간의 U+FEFF는 그대로, 앞의 BOM은 지우고 읽는다", () => {
    const hangul = [0xed, 0x80, 0x80];
    const bom = [0xef, 0xbb, 0xbf];
    expect(decodeBody(Uint8Array.from([...hangul, ...RAW_D800, ...bom, 0x78]))).toBe(
      "\ud000\ud800\ufeffx",
    );
    expect(decodeBody(Uint8Array.from([...bom, ...RAW_DFFF, ...bom]))).toBe("\udfff\ufeff");
    expect(decodeBody(Uint8Array.from([...RAW_D800, ...RAW_D800]))).toBe("\ud800\ud800");
  });

  it.each([
    ["잘린 서로게이트", [0xed, 0xa0]],
    ["ED 뒤의 ASCII", [0xed, 0x7f]],
    ["서로게이트 앞의 잘린 글자", [0xe3, 0x81, ...RAW_D800]],
  ])("그 밖의 잘못된 UTF-8(%s)은 detail 없는 400이다", async (_label, raw) => {
    const body = withBytes(create("email-verifications", { token: "@@" }), raw);
    expect(await errorsOf(await send("EmailVerificationCreateDocument", body), 400)).toEqual([
      { status: "400", code: "jsonapi.invalid_document", title: "Bad Request" },
    ]);
  });
});
