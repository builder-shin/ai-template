/**
 * 가짜 OAuth 서버의 HTTP 쪽(/_mock/oauth). 테스트 통로라 MOCK_TEST_ENDPOINTS가 켜져 있을 때만 붙는다.
 * 규칙은 server.ts에, 화면은 page.ts에 있다.
 *
 * - GET /_mock/oauth/<제공자>/authorize?<인가 요청>: 로그인 화면(HTML). 인가 요청이 틀렸으면 400 안내다.
 * - POST 같은 주소(폼): 로그인하거나 거부하고 302로 redirect_uri에 돌려보낸다. 폼 필드는 다음과 같다.
 *   - username(필수): 제공자 안의 사용자 id. 프로필의 sub가 된다.
 *   - claims: 프로필의 JSON 객체(모의 OAuth 서버의 claims). 있으면 name, email, emailVerified 대신 쓴다.
 *   - name, email, emailVerified(값이 있으면 확인됨): claims가 없으면 제공자 모양의 claims를 만든다.
 *   - error: 있으면 로그인하지 않고 이 에러로 돌려보낸다(화면의 거부 버튼은 access_denied).
 *   username이 비었거나 claims가 JSON 객체가 아니면 400으로 폼을 다시 보여 준다.
 * - 모르는 제공자는 404다.
 */

import { Hono } from "hono";
import type { AppEnv } from "../context.ts";
import { isRecord } from "../json.ts";
import { EMPTY_LOGIN, type LoginValues, loginPage, requestProblemPage } from "./page.ts";
import {
  authorizationRequest,
  denial,
  isOAuthProvider,
  type OAuthProvider,
  type OAuthServer,
  personClaims,
  type Profile,
  profileOf,
} from "./server.ts";

type Form = Readonly<Record<string, unknown>>;

function text(form: Form, name: string): string {
  const value = form[name];
  return typeof value === "string" ? value : "";
}

/** 앞뒤 공백을 지운 값. 비었으면 undefined다. */
function filled(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function valuesOf(form: Form): LoginValues {
  return {
    username: text(form, "username"),
    name: text(form, "name"),
    email: text(form, "email"),
    emailVerified: text(form, "emailVerified") !== "",
    claims: text(form, "claims"),
  };
}

function parseClaims(raw: string): Profile | undefined {
  try {
    const value: unknown = JSON.parse(raw);
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** 폼으로 고른 신원의 프로필. 틀렸으면 무엇이 틀렸는지(한국어)를 준다. */
function profileFrom(
  provider: OAuthProvider,
  values: LoginValues,
): { readonly profile: Profile } | { readonly problem: string } {
  const { username } = values;
  if (username.trim() === "") return { problem: "사용자 id를 넣는다." };
  if (values.claims.trim() !== "") {
    const claims = parseClaims(values.claims);
    if (claims === undefined) return { problem: "claims는 JSON 객체여야 한다." };
    return { profile: profileOf(username, claims) };
  }
  const person = {
    subject: username,
    email: filled(values.email),
    emailVerified: values.emailVerified,
    name: filled(values.name),
  };
  return { profile: profileOf(username, personClaims(provider, person)) };
}

export function oauthServerRoutes(server: OAuthServer): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/:provider/authorize", (c) => {
    const provider = c.req.param("provider");
    if (!isOAuthProvider(provider)) return c.notFound();
    const parsed = authorizationRequest(c.req.query());
    if ("problem" in parsed) return c.html(requestProblemPage(provider, parsed.problem), 400);
    return c.html(loginPage(provider, EMPTY_LOGIN));
  });

  routes.post("/:provider/authorize", async (c) => {
    const provider = c.req.param("provider");
    if (!isOAuthProvider(provider)) return c.notFound();
    const parsed = authorizationRequest(c.req.query());
    if ("problem" in parsed) return c.html(requestProblemPage(provider, parsed.problem), 400);
    const form: Form = await c.req.parseBody();
    const error = filled(text(form, "error"));
    if (error !== undefined) return c.redirect(denial(parsed.request, error), 302);
    const values = valuesOf(form);
    const login = profileFrom(provider, values);
    if ("problem" in login) return c.html(loginPage(provider, values, login.problem), 400);
    return c.redirect(server.grant(provider, parsed.request, login.profile), 302);
  });

  return routes;
}
