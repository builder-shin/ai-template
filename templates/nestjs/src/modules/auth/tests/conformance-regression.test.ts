import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import { hashPassword } from "../../../core/security/passwords.js";
import { AuditLogsRepository } from "../../audit-logs/index.js";
import { OAuthState } from "../index.js";
import { memoryRedis } from "../oauth/tests/fixtures.js";
import { sessionFixture, userId } from "./session-fixtures.js";
import { passwordFixture } from "./password-fixtures.js";

const password = "contract-fixture-password"; // betterleaks:allow 사유: 격리 시험의 가짜 비밀번호
const client = { ip: "192.0.2.1" };

it.each(["password", "oauth"] as const)(
  "%s 로그인 감사의 공개 대상은 현재 사용자다",
  async (method) => {
    const oauth = new OAuthState(memoryRedis().redis);
    const f = sessionFixture(oauth);
    f.addUser({ passwordHash: await hashPassword(password) });
    if (method === "password") {
      await f.service.createWithPassword({ email: "member@example.com", password }, client);
    } else {
      const codeVerifier = "v".repeat(43);
      const code = await oauth.issueCode({
        userId,
        provider: "google",
        codeChallenge: createHash("sha256").update(codeVerifier).digest("base64url"),
      });
      await f.service.createWithOAuthCode({ code, codeVerifier }, client);
    }
    expect(f.state.audits).toMatchObject([
      {
        action: "session.login_succeeded",
        actorUserId: userId,
        targetType: "users",
        targetId: userId,
      },
    ]);
    const row = { id: "audit", createdAt: new Date(), ...f.state.audits[0] } as Parameters<
      AuditLogsRepository["resource"]
    >[0];
    expect(new AuditLogsRepository().resource(row)).toMatchObject({
      attributes: { targetType: "users", targetId: userId },
      relationships: { actor: { data: { type: "users", id: userId } } },
    });
  },
);

it.each(["wrong", "\ud800"])(
  "현재 비밀번호 %j의 실패는 정확한 필드와 Bearer 401을 유지한다",
  async (currentPassword) => {
    const f = passwordFixture();
    f.addUser({ passwordHash: await hashPassword(password) });
    const session = f.addSession();
    f.addToken("reset");
    const before = structuredClone(f.state);
    await expect(
      f.service.change(
        { userId, sessionId: session.id, permissions: new Set() },
        {
          currentPassword,
          newPassword: password + "-new",
        },
      ),
    ).rejects.toMatchObject({
      init: {
        status: 401,
        code: "auth.invalid_credentials",
        source: { pointer: "/data/attributes/currentPassword" },
        headers: { "WWW-Authenticate": "Bearer" },
      },
    });
    expect(f.state).toEqual(before);
    expect(f.events).toContain("rollback");
  },
);
