import "reflect-metadata";
import { afterEach, expect, it } from "vitest";
import request from "supertest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { getState } from "./state.js";
import { createApp } from "../../src/core/http/create-app.js";
import { UnitOfWork } from "../../src/core/db/unit-of-work.js";
import { seedSystem, RolesRepository } from "../../src/modules/roles/index.js";
import { PRINCIPAL_RESOLVER, type PrincipalResolver } from "../../src/core/security/principal.js";
import { ApiError } from "../../src/core/jsonapi/errors.js";

const apps: NestExpressApplication[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});
async function fixture() {
  const { prisma, settings } = getState();
  const unit = new UnitOfWork(prisma);
  const { adminUserId } = await unit.run((tx) => seedSystem(tx, settings));
  const member = await prisma.user.create({ data: { email: "member@example.com" } });
  const repository = new RolesRepository();
  await unit.run((tx) => repository.assign(tx, member.id, ["member"]));
  const resolver: PrincipalResolver = {
    resolve: async (authorization) => {
      if (authorization === undefined) return undefined;
      const userId =
        authorization === "Bearer admin-fixture"
          ? adminUserId
          : authorization === "Bearer member-fixture"
            ? member.id
            : undefined;
      if (!userId)
        throw new ApiError({ status: 401, code: "auth.token_invalid", title: "Invalid token" });
      return {
        userId,
        sessionId: "integration-fixture",
        permissions: await unit.run((tx) => repository.permissionsOf(tx, userId)),
      };
    },
  };
  const app = await createApp(
    { settings, providers: [{ provide: PRINCIPAL_RESOLVER, useValue: resolver }] },
    false,
  );
  apps.push(app);
  return request(app.getHttpServer());
}
it("시드 관리자의 실제 DB 권한으로 목록과 역순을 조회한다", async () => {
  const http = await fixture();
  const ascending = [
    "admin:access",
    "audit-logs:read",
    "posts:create",
    "posts:manage",
    "roles:manage",
    "roles:read",
    "users:manage",
    "users:read",
  ];
  for (const [query, expected] of [
    ["", ascending],
    ["?sort=-id", [...ascending].reverse()],
  ] as const) {
    const res = await http
      .get(`/api/v1/permissions${query}`)
      .set("Authorization", "Bearer admin-fixture");
    expect(res.status).toBe(200);
    expect((JSON.parse(res.text) as { data: { id: string }[] }).data.map((p) => p.id)).toEqual(
      expected,
    );
  }
});
it("roles:read가 없는 실제 member는 권한 목록에서 403이다", async () => {
  const http = await fixture();
  const res = await http.get("/api/v1/permissions").set("Authorization", "Bearer member-fixture");
  expect(res.status).toBe(403);
  expect(JSON.parse(res.text) as unknown).toMatchObject({
    errors: [{ code: "permission.denied" }],
  });
});
