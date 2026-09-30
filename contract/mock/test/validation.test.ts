/**
 * 요청 문서 검증. 기대값은 FastAPI 템플릿에 같은 요청을 보내 얻은 응답(상태와 에러 객체, detail
 * 포함)이다. FastAPI 테스트(test_errors.py, 인증·파일·역할·사용자 테스트)가 다루는 경우는 같은 입력을
 * 쓴다. 공통 계층의 샘플 리소스(widgets) 대신 계약의 요청 문서를 쓴다.
 */

import { describe, expect, it } from "vitest";
import { contractValidator } from "../src/jsonapi/contract-schemas.ts";
import type { ErrorObject } from "../src/jsonapi/errors.ts";
import { JSONAPI_MEDIA_TYPE } from "../src/jsonapi/media.ts";
import {
  isRequestDocumentName,
  REQUEST_DOCUMENT_NAMES,
  readJsonBody,
  requireMatchingId,
  validateDocument,
} from "../src/jsonapi/validation.ts";
import { errorsOf, testApp } from "./support.ts";

const PASSWORD = "conformance-password"; // betterleaks:allow 테스트용 가짜 비밀번호
const REGISTRATION = { email: "someone@example.com", password: PASSWORD, name: "누군가" };
const PERMISSIONS =
  "'admin:access', 'users:read', 'users:manage', 'roles:read', 'roles:manage', " +
  "'audit-logs:read', 'posts:create' or 'posts:manage'";
const DICT = "Input should be a valid dictionary or object to extract fields from";
const STRING = "Input should be a valid string";
const INTEGER = "Input should be a valid integer";
const REQUIRED = "Field required";
const NOT_EMAIL = "value is not a valid email address: An email address must have an @-sign.";

/** 요청 문서를 검증해 돌려주는 시험용 라우트(FastAPI 쪽은 같은 모델을 본문으로 받는 라우트). */
function validatingApp() {
  const { app } = testApp();
  app.post("/api/v1/probe/:schema", async (c) => {
    const name = c.req.param("schema");
    if (!isRequestDocumentName(name)) throw new Error(`요청 문서가 아니다: ${name}`);
    const body = await readJsonBody(c);
    return c.json(validateDocument(name, body));
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

/** 에러 문서의 에러 객체들. 문서가 계약의 ErrorDocument인지도 본다. */
async function rejected(schema: string, body: string | Uint8Array, status: number) {
  const response = await send(schema, body);
  const errors = await errorsOf(response.clone(), status);
  const validate = contractValidator("ErrorDocument");
  expect(validate(await response.json()), JSON.stringify(validate.errors)).toBe(true);
  return errors;
}

async function accepted(schema: string, body: string): Promise<unknown> {
  const response = await send(schema, body);
  expect(response.status, await response.clone().text()).toBe(200);
  return response.json();
}

function create(type: unknown, attributes?: unknown, data: Record<string, unknown> = {}): string {
  return JSON.stringify({
    data: { type, ...(attributes === undefined ? {} : { attributes }), ...data },
  });
}

function update(data: Record<string, unknown>): string {
  return JSON.stringify({ data });
}

function structure(pointer: string | undefined, detail: string): ErrorObject {
  const source = pointer === undefined ? {} : { source: { pointer } };
  return {
    status: "400",
    code: "jsonapi.invalid_document",
    title: "Bad Request",
    detail,
    ...source,
  };
}

function field(
  code: ErrorObject["code"],
  pointer: string,
  detail: string,
  params?: Record<string, unknown>,
): ErrorObject {
  const meta = params === undefined ? {} : { meta: { params } };
  return {
    status: "422",
    code,
    title: "Unprocessable Content",
    detail,
    source: { pointer },
    ...meta,
  };
}

function conflict(detail: string): ErrorObject {
  return {
    status: "409",
    code: "resource.conflict",
    title: "Conflict",
    detail,
    source: { pointer: "/data/type" },
  };
}

const choice = (pointer: string, expected: string) =>
  field("validation.invalid_choice", pointer, `Input should be ${expected}`, { expected });
const tooShort = (pointer: string, min: number, noun = "characters") =>
  field("validation.too_short", pointer, `String should have at least ${String(min)} ${noun}`, {
    min,
  });
const tooLong = (pointer: string, max: number) =>
  field("validation.too_long", pointer, `String should have at most ${String(max)} characters`, {
    max,
  });
const required = (pointer: string) => field("validation.required", pointer, REQUIRED);
const invalidFormat = (pointer: string, detail = STRING) =>
  field("validation.invalid_format", pointer, detail);

describe("본문 읽기", () => {
  it.each([
    ["빈 본문", "", structure("", REQUIRED)],
    ["null", "null", structure("", REQUIRED)],
    ["공백뿐인 본문", " ", structure(undefined, "Request body is not valid JSON.")],
    ["깨진 JSON", '{"data": ', structure(undefined, "Request body is not valid JSON.")],
    ["배열", "[]", structure("", DICT)],
    ["문자열", '"x"', structure("", DICT)],
  ])("%s는 400 jsonapi.invalid_document다", async (_label, body, error) => {
    expect(await rejected("RegistrationCreateDocument", body, 400)).toEqual([error]);
  });

  it("UTF-8이 아닌 본문은 detail과 source가 없는 400이다", async () => {
    const bytes = Uint8Array.from([...Buffer.from('{"data": "'), 0xff, ...Buffer.from('"}')]);
    expect(await rejected("RegistrationCreateDocument", bytes, 400)).toEqual([
      { status: "400", code: "jsonapi.invalid_document", title: "Bad Request" },
    ]);
  });

  it("앞의 UTF-8 BOM은 지우고 읽는다", async () => {
    const body = `\uFEFF${create("registrations", REGISTRATION)}`;
    expect(await accepted("RegistrationCreateDocument", body)).toEqual({
      data: { type: "registrations", attributes: REGISTRATION },
    });
  });
});

describe("문서 구조는 400, type 불일치는 409, 클라이언트 id는 403", () => {
  it.each([
    ["data가 없다", "{}", "/data", REQUIRED],
    ["data가 배열이다", '{"data": []}', "/data", DICT],
    ["data가 null이다", '{"data": null}', "/data", DICT],
    [
      "type이 문자열이 아니다",
      create(5, REGISTRATION),
      "/data/type",
      "Input should be 'registrations'",
    ],
    ["type이 없다", JSON.stringify({ data: { attributes: REGISTRATION } }), "/data/type", REQUIRED],
    ["attributes가 없다", create("registrations"), "/data/attributes", REQUIRED],
    ["attributes가 문자열이다", create("registrations", "x"), "/data/attributes", DICT],
  ])("%s", async (_label, body, pointer, detail) => {
    expect(await rejected("RegistrationCreateDocument", body, 400)).toEqual([
      structure(pointer, detail),
    ]);
  });

  it("본문의 type이 엔드포인트와 다르면 409 resource.conflict다", async () => {
    const errors = await rejected("RegistrationCreateDocument", create("users", REGISTRATION), 409);
    expect(errors).toEqual([conflict("Input should be 'registrations'")]);
  });

  it("생성 요청에 클라이언트가 만든 id가 있으면 data의 다른 오류 없이 403이다", async () => {
    const denied = {
      status: "403",
      code: "permission.denied",
      title: "Forbidden",
      detail: "Client-generated ids are not supported.",
      source: { pointer: "/data/id" },
    };
    for (const body of [
      create("registrations", REGISTRATION, { id: "mine" }),
      create("users", {}, { id: "mine" }),
      create("registrations", REGISTRATION, { id: null }),
    ]) {
      expect(await rejected("RegistrationCreateDocument", body, 403)).toEqual([denied]);
    }
  });

  it("상태가 섞이면 400으로 모든 에러 객체를 필드 순서대로 담는다", async () => {
    const body = create("users", { password: "x" });
    expect(await rejected("RegistrationCreateDocument", body, 400)).toEqual([
      conflict("Input should be 'registrations'"),
      required("/data/attributes/email"),
      tooShort("/data/attributes/password", 8),
      required("/data/attributes/name"),
    ]);
    const patch = update({ attributes: { title: "" } });
    expect(await rejected("PostUpdateDocument", patch, 400)).toEqual([
      structure("/data/type", REQUIRED),
      structure("/data/id", REQUIRED),
      tooShort("/data/attributes/title", 1, "character"),
    ]);
  });
});

describe("필드 오류는 필드마다 422이고 순서는 모델의 필드 순서다", () => {
  const registration = (attributes: Record<string, unknown>) =>
    create("registrations", { ...REGISTRATION, ...attributes });
  const post = (attributes: Record<string, unknown>, relationships?: unknown) =>
    create(
      "posts",
      { title: "t", body: "b", ...attributes },
      relationships === undefined ? {} : { relationships },
    );

  it.each([
    [
      "이메일 형식",
      registration({ email: "not-an-email" }),
      [invalidFormat("/data/attributes/email", NOT_EMAIL)],
    ],
    ["문자열이 아닌 이메일", registration({ email: 5 }), [invalidFormat("/data/attributes/email")]],
    [
      "짧은 비밀번호",
      registration({ password: "x".repeat(7) }),
      [tooShort("/data/attributes/password", 8)],
    ],
    [
      "긴 비밀번호",
      registration({ password: "x".repeat(129) }),
      [tooLong("/data/attributes/password", 128)],
    ],
    [
      "공백뿐인 이름",
      registration({ name: "   " }),
      [tooShort("/data/attributes/name", 1, "character")],
    ],
    [
      "코드 포인트 101개인 이름",
      registration({ name: "😀".repeat(101) }),
      [tooLong("/data/attributes/name", 100)],
    ],
    [
      "모르는 로케일",
      registration({ locale: "fr" }),
      [choice("/data/attributes/locale", "'ko' or 'en'")],
    ],
    [
      "숫자 로케일",
      registration({ locale: 5 }),
      [choice("/data/attributes/locale", "'ko' or 'en'")],
    ],
    [
      "null 로케일",
      registration({ locale: null }),
      [choice("/data/attributes/locale", "'ko' or 'en'")],
    ],
    [
      "빠진 필드와 틀린 필드가 섞임",
      create("registrations", { email: "bad", name: "" }),
      [
        invalidFormat("/data/attributes/email", NOT_EMAIL),
        required("/data/attributes/password"),
        tooShort("/data/attributes/name", 1, "character"),
      ],
    ],
  ])("가입: %s", async (_label, body, errors) => {
    expect(await rejected("RegistrationCreateDocument", body, 422)).toEqual(errors);
  });

  it.each([
    [
      "size 0",
      { filename: "a.png", contentType: "image/png", size: 0 },
      [
        field(
          "validation.out_of_range",
          "/data/attributes/size",
          "Input should be greater than or equal to 1",
          { min: 1 },
        ),
      ],
    ],
    [
      "소수 size",
      { filename: "a.png", contentType: "image/png", size: 1.5 },
      [invalidFormat("/data/attributes/size", INTEGER)],
    ],
    [
      "숫자 문자열 size",
      { filename: "a.png", contentType: "image/png", size: "10" },
      [invalidFormat("/data/attributes/size", INTEGER)],
    ],
    [
      "불리언 size",
      { filename: "a.png", contentType: "image/png", size: true },
      [invalidFormat("/data/attributes/size", INTEGER)],
    ],
    [
      "빈 파일 이름",
      { filename: "", contentType: "image/png", size: 1 },
      [tooShort("/data/attributes/filename", 1, "character")],
    ],
    [
      "size만 있음",
      { size: 0 },
      [
        required("/data/attributes/filename"),
        required("/data/attributes/contentType"),
        field(
          "validation.out_of_range",
          "/data/attributes/size",
          "Input should be greater than or equal to 1",
          { min: 1 },
        ),
      ],
    ],
  ])("파일: %s", async (_label, attributes, errors) => {
    expect(await rejected("FileCreateDocument", create("files", attributes), 422)).toEqual(errors);
  });

  it("역할: 선택지, 길이, 널 허용 문자열, 배열 원소", async () => {
    const role = (attributes: Record<string, unknown>) =>
      create("roles", { name: "x", permissions: [], ...attributes });
    const check = async (attributes: Record<string, unknown>, errors: ErrorObject[]) => {
      expect(await rejected("RoleCreateDocument", role(attributes), 422)).toEqual(errors);
    };
    await check({ permissions: ["nope:code"] }, [
      choice("/data/attributes/permissions/0", PERMISSIONS),
    ]);
    await check({ permissions: ["users:read", null, 5] }, [
      choice("/data/attributes/permissions/1", PERMISSIONS),
      choice("/data/attributes/permissions/2", PERMISSIONS),
    ]);
    await check({ permissions: "users:read" }, [
      invalidFormat("/data/attributes/permissions", "Input should be a valid list"),
    ]);
    await check({ name: "x".repeat(51) }, [tooLong("/data/attributes/name", 50)]);
    await check({ description: "d".repeat(201) }, [tooLong("/data/attributes/description", 200)]);
    await check({ description: 5 }, [invalidFormat("/data/attributes/description")]);
    expect(await accepted("RoleCreateDocument", role({ description: null }))).toMatchObject({
      data: { attributes: { description: null } },
    });
    const nullName = update({ type: "roles", id: "x", attributes: { name: null } });
    expect(await rejected("RoleUpdateDocument", nullName, 422)).toEqual([
      invalidFormat("/data/attributes/name"),
    ]);
  });

  it("글: 길이, 선택지, 단수 관계", async () => {
    const check = async (body: string, errors: ErrorObject[], status = 422) => {
      expect(await rejected("PostCreateDocument", body, status)).toEqual(errors);
    };
    await check(post({ title: "" }), [tooShort("/data/attributes/title", 1, "character")]);
    await check(post({ body: "가".repeat(100_001) }), [tooLong("/data/attributes/body", 100_000)]);
    await check(post({ status: "archived" }), [
      choice("/data/attributes/status", "'draft' or 'published'"),
    ]);
    const cover = "/data/relationships/coverImage/data";
    await check(post({}, { coverImage: { data: { type: "users", id: "x" } } }), [
      choice(`${cover}/type`, "'files'"),
    ]);
    await check(post({}, { coverImage: {} }), [required(cover)]);
    await check(post({}, { coverImage: { data: "x" } }), [invalidFormat(cover, DICT)]);
    await check(post({}, { coverImage: { data: { type: "files" } } }), [required(`${cover}/id`)]);
    await check(post({}, null), [structure("/data/relationships", DICT)], 400);
    expect(
      await accepted("PostCreateDocument", post({}, { coverImage: { data: null } })),
    ).toMatchObject({
      data: { relationships: { coverImage: { data: null } } },
    });
  });

  it("사용자: type 불일치, 복수 관계의 원소, 선택지", async () => {
    const me = (data: Record<string, unknown>) => update({ type: "users", id: "x", ...data });
    expect(await rejected("UserMeUpdateDocument", update({ type: "roles", id: "x" }), 409)).toEqual(
      [conflict("Input should be 'users'")],
    );
    expect(await rejected("UserMeUpdateDocument", me({ attributes: { name: "" } }), 422)).toEqual([
      tooShort("/data/attributes/name", 1, "character"),
    ]);
    const avatar = { avatar: { data: { type: "files", id: 5 } } };
    expect(await rejected("UserMeUpdateDocument", me({ relationships: avatar }), 422)).toEqual([
      invalidFormat("/data/relationships/avatar/data/id"),
    ]);
    const roles = {
      roles: { data: [{ type: "roles", id: "a" }, { type: "files", id: "b" }, "x"] },
    };
    expect(await rejected("UserUpdateDocument", me({ relationships: roles }), 422)).toEqual([
      choice("/data/relationships/roles/data/1/type", "'roles'"),
      invalidFormat("/data/relationships/roles/data/2", DICT),
    ]);
    const status = me({ attributes: { status: "gone" } });
    expect(await rejected("UserUpdateDocument", status, 422)).toEqual([
      choice("/data/attributes/status", "'active', 'deactivated' or 'deleted'"),
    ]);
  });
});

describe("판별 유니온(세션 grant)", () => {
  const grant = (attributes: unknown, type = "sessions") => create(type, attributes);
  const tags = "expected tags: 'password', 'refreshToken', 'oauthCode'";
  const pointer = "/data/attributes/grantType";

  it("판별자가 없으면 validation.required, 모르는 값이면 validation.invalid_choice다", async () => {
    expect(await rejected("SessionCreateDocument", grant({ email: "a@example.com" }), 422)).toEqual(
      [
        field(
          "validation.required",
          pointer,
          "Unable to extract tag using discriminator 'grant_type' | 'grantType'",
        ),
      ],
    );
    for (const [value, shown] of [
      ["magic", "magic"],
      [5, "5"],
      [null, "None"],
    ] as const) {
      const detail = `Input tag '${shown}' found using 'grant_type' | 'grantType' does not match any of the ${tags}`;
      expect(await rejected("SessionCreateDocument", grant({ grantType: value }), 422)).toEqual([
        field("validation.invalid_choice", pointer, detail),
      ]);
    }
  });

  it("고른 멤버의 필드 오류는 본문에 있는 위치를 가리킨다", async () => {
    const missing = grant({ grantType: "password", email: "a@example.com" });
    expect(await rejected("SessionCreateDocument", missing, 422)).toEqual([
      required("/data/attributes/password"),
    ]);
    const both = grant({ grantType: "password", email: "bad" });
    expect(await rejected("SessionCreateDocument", both, 422)).toEqual([
      invalidFormat("/data/attributes/email", NOT_EMAIL),
      required("/data/attributes/password"),
    ]);
    const collided = grant({ grantType: "password", email: "bad", password: "x" });
    expect(await rejected("SessionCreateDocument", collided, 422)).toEqual([
      invalidFormat("/data/attributes/email", NOT_EMAIL),
    ]);
    const refresh = grant({ grantType: "refreshToken", refreshToken: 5 });
    expect(await rejected("SessionCreateDocument", refresh, 422)).toEqual([
      invalidFormat("/data/attributes/refreshToken"),
    ]);
    const oauth = grant({ grantType: "oauthCode", code: 5 });
    expect(await rejected("SessionCreateDocument", oauth, 422)).toEqual([
      invalidFormat("/data/attributes/code"),
      required("/data/attributes/codeVerifier"),
    ]);
  });

  it("유니온 자리가 객체가 아니면 400, type 불일치와 섞이면 400에 모두 담는다", async () => {
    expect(await rejected("SessionCreateDocument", grant("x"), 400)).toEqual([
      structure("/data/attributes", DICT),
    ]);
    const detail = `Input tag 'magic' found using 'grant_type' | 'grantType' does not match any of the ${tags}`;
    expect(
      await rejected("SessionCreateDocument", grant({ grantType: "magic" }, "users"), 400),
    ).toEqual([
      conflict("Input should be 'sessions'"),
      field("validation.invalid_choice", pointer, detail),
    ]);
  });
});

describe("FastAPI 모델처럼 값을 바꾼다", () => {
  it("이메일과 이름의 앞뒤 공백을 지우고 이메일 도메인을 소문자로 바꾼다", async () => {
    const body = create("registrations", {
      ...REGISTRATION,
      email: "\u00A0 A@Example.COM\u3000",
      name: "  Ada  ",
    });
    expect(await accepted("RegistrationCreateDocument", body)).toEqual({
      data: {
        type: "registrations",
        attributes: { ...REGISTRATION, email: "A@example.com", name: "Ada" },
      },
    });
  });

  it("특수 용도 도메인의 이메일은 받지 않는다", async () => {
    for (const [email, reason] of [
      ["a@foo.test", "is a special-use or reserved name that cannot be used with email."],
      ["admin@localhost", "is not valid. It should have a period."],
    ] as const) {
      const body = create("registrations", { ...REGISTRATION, email });
      expect(await rejected("RegistrationCreateDocument", body, 422)).toEqual([
        invalidFormat(
          "/data/attributes/email",
          `value is not a valid email address: The part after the @-sign ${reason}`,
        ),
      ]);
    }
  });

  it("스키마에 없는 멤버는 버린다", async () => {
    const body = create("registrations", { ...REGISTRATION, extra: 1 }, { meta: { a: 1 } });
    expect(await accepted("RegistrationCreateDocument", body)).toEqual({
      data: { type: "registrations", attributes: REGISTRATION },
    });
  });

  it("받은 본문은 바꾸지 않고 사본을 돌려준다", () => {
    const body = {
      data: { type: "registrations", attributes: { ...REGISTRATION, name: " Ada " } },
    };
    const document = validateDocument("RegistrationCreateDocument", body);
    expect(document.data.attributes.name).toBe("Ada");
    expect(body.data.attributes.name).toBe(" Ada ");
  });
});

describe("계약과 다른 검사", () => {
  it("시작할 때 계약의 요청 문서 스키마를 모두 컴파일한다", () => {
    expect(REQUEST_DOCUMENT_NAMES).toHaveLength(17);
    expect(REQUEST_DOCUMENT_NAMES).toContain("SessionCreateDocument");
    expect(isRequestDocumentName("ErrorDocument")).toBe(false);
  });

  it("수정 요청의 data.id가 경로의 리소스와 다르면 409다", () => {
    expect(() => {
      requireMatchingId("a", "a");
    }).not.toThrow();
    expect(() => {
      requireMatchingId("b", "a");
    }).toThrow(expect.objectContaining({ status: 409, code: "resource.conflict" }));
  });
});
