import { expect, it } from "vitest";
import { sessionFixture, sessionDocument, errorCode } from "./session-fixture.js";
it("같은 refresh 10개 경쟁은 201 하나·재사용 401 하나·폐기 401 여덟이고 이긴 토큰도 무효다", async () => {
  const f = await sessionFixture();
  const login = await f.login();
  expect(login.status).toBe(201);
  const first = sessionDocument(login.text);
  const responses = await Promise.all(
    Array.from({ length: 10 }, () =>
      f.post({ grantType: "refreshToken", refreshToken: first.data.attributes.refreshToken }),
    ),
  );
  expect(responses.map((r) => r.status).sort()).toEqual([
    201, 401, 401, 401, 401, 401, 401, 401, 401, 401,
  ]);
  const rejected = responses.filter((r) => r.status === 401);
  expect(rejected.map((r) => errorCode(r.text)).sort()).toEqual([
    "auth.refresh_token_reused",
    ...Array<string>(8).fill("auth.token_invalid"),
  ]);
  expect(rejected.every((r) => r.headers["www-authenticate"] === "Bearer")).toBe(true);
  const session = await f.unit.run((tx) => tx.session.findUnique({ where: { id: first.data.id } }));
  expect(session?.revokedAt).toBeInstanceOf(Date);
  expect(session?.revokedReason).toBe("refresh_token_reused");
  const winner = responses.find((r) => r.status === 201);
  expect(winner).toBeDefined();
  if (!winner) throw new Error("경쟁에서 성공한 요청이 없다");
  const next = sessionDocument(winner.text);
  const access = await f.http
    .get("/api/v1/sessions")
    .set("Authorization", `Bearer ${next.data.attributes.accessToken}`);
  const refresh = await f.post({
    grantType: "refreshToken",
    refreshToken: next.data.attributes.refreshToken,
  });
  for (const response of [access, refresh]) {
    expect(response.status).toBe(401);
    expect(response.headers["www-authenticate"]).toBe("Bearer");
    expect(errorCode(response.text)).toBe("auth.token_invalid");
  }
});
