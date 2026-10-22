import "reflect-metadata";
import { expect, it } from "vitest";
import { OAuthService, SessionsService } from "../../index.js";
import { testApp, errorDocument, mediaType } from "../../../../core/http/tests/fixtures.js";
import { sessionFixture } from "../../tests/session-fixtures.js";
import { oauthFixture, FRONT, CHALLENGE, VERIFIER } from "./fixtures.js";
async function fixture(redirectUris?: readonly string[]) {
  const oauth = oauthFixture(redirectUris);
  const sessions = sessionFixture(oauth.store);
  const app = await testApp([], {
    configure: (app) => {
      const target = app.get(OAuthService);
      target.authorize = oauth.service.authorize.bind(oauth.service);
      target.callback = oauth.service.callback.bind(oauth.service);
      app.get(SessionsService).createWithOAuthCode = sessions.service.createWithOAuthCode.bind(
        sessions.service,
      );
    },
  });
  const authorize = () =>
    app.http
      .get("/api/v1/oauth/google/authorize")
      .query({ redirectUri: FRONT, codeChallenge: CHALLENGE });
  return { ...app, oauth, sessions, authorize };
}
it("명시한 네이티브 콜백으로 돌아가 원래 verifier로 세션을 만들고 재사용을 거절한다", async () => {
  const native = "aitpl-example://oauth/callback";
  const f = await fixture([FRONT, native]);
  const started = await f.http
    .get("/api/v1/oauth/google/authorize")
    .query({ redirectUri: native, codeChallenge: CHALLENGE });
  expect(started.status).toBe(302);
  const state = new URL(started.headers.location as string).searchParams.get("state");
  const back = await f.http
    .get("/api/v1/oauth/google/callback")
    .query({ state, code: "provider-code" });
  expect(back.status).toBe(302);
  const url = new URL(back.headers.location as string);
  expect([url.protocol, url.hostname, url.pathname]).toEqual([
    "aitpl-example:",
    "oauth",
    "/callback",
  ]);
  const user = f.oauth.data.users[0];
  if (!user) throw new Error("사용자가 없다");
  f.sessions.addUser(user);
  const document = {
    data: {
      type: "sessions",
      attributes: {
        grantType: "oauthCode",
        code: url.searchParams.get("code"),
        codeVerifier: VERIFIER,
      },
    },
  };
  expect(
    (await f.http.post("/api/v1/sessions").set("Content-Type", mediaType).send(document)).status,
  ).toBe(201);
  expect(
    (await f.http.post("/api/v1/sessions").set("Content-Type", mediaType).send(document)).status,
  ).toBe(401);
});
it("OAuth authorize는 쿼리를 검증하고 본문 없는 302 Location을 보낸다", async () => {
  const f = await fixture();
  const response = await f.authorize();
  expect(response.status).toBe(302);
  expect(response.text).toBe("");
  expect(response.headers["content-type"]).toBeUndefined();
  expect(new URL(response.headers.location as string).searchParams.get("state")).toEqual(
    expect.any(String),
  );
});
it.each([
  [{ redirectUri: FRONT }, "codeChallenge"],
  [{ redirectUri: "https://evil.example/cb", codeChallenge: CHALLENGE }, "redirectUri"],
  [{ redirectUri: FRONT, codeChallenge: "short" }, "codeChallenge"],
])("OAuth authorize %j 오류는 400 parameter %s다", async (query, parameter) => {
  const f = await fixture();
  const response = await f.http.get("/api/v1/oauth/google/authorize").query(query);
  expect(response.status).toBe(400);
  expect(errorDocument(response.text).errors[0]).toMatchObject({
    code: "jsonapi.invalid_query",
    title: "Invalid query",
    source: { parameter },
  });
});
it("알 수 없는 제공자는 404이고 누락 state는 400이다", async () => {
  const f = await fixture();
  expect(
    (
      await f.http
        .get("/api/v1/oauth/github/authorize")
        .query({ redirectUri: FRONT, codeChallenge: CHALLENGE })
    ).status,
  ).toBe(404);
  const response = await f.http.get("/api/v1/oauth/google/callback");
  expect(response.status).toBe(400);
  expect(errorDocument(response.text).errors[0]).toMatchObject({ source: { parameter: "state" } });
});
it("콜백의 제공자 추가 쿼리는 허용하고 저장된 프론트·challenge로 코드를 발급한다", async () => {
  const f = await fixture();
  const started = await f.authorize();
  expect(started.status).toBe(302);
  const state = new URL(started.headers.location as string).searchParams.get("state");
  const callback = await f.http.get("/api/v1/oauth/google/callback").query({
    state,
    code: "provider-code",
    scope: "openid email profile",
    authuser: "0",
    redirectUri: "https://evil.example/cb",
    codeChallenge: "b".repeat(43),
  });
  expect(callback.status).toBe(302);
  expect(callback.text).toBe("");
  const url = new URL(callback.headers.location as string);
  expect(url.origin + url.pathname).toBe(FRONT);
  const user = f.oauth.data.users[0];
  if (!user) throw new Error("사용자가 없다");
  f.sessions.addUser(user);
  const attributes = {
    grantType: "oauthCode",
    code: url.searchParams.get("code"),
    codeVerifier: VERIFIER,
  };
  const response = await f.http
    .post("/api/v1/sessions")
    .set("Content-Type", mediaType)
    .send({ data: { type: "sessions", attributes } });
  expect(response.status).toBe(201);
  expect(f.sessions.state.sessions).toHaveLength(1);
  const reused = await f.http
    .post("/api/v1/sessions")
    .set("Content-Type", mediaType)
    .send({ data: { type: "sessions", attributes } });
  expect(reused.status).toBe(401);
  expect(reused.headers["www-authenticate"]).toBe("Bearer");
  expect(errorDocument(reused.text).errors[0]?.code).toBe("auth.oauth_code_invalid");
});
