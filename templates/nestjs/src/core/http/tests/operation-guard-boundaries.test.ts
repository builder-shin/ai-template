import "reflect-metadata";
import { expect, it } from "vitest";
import { Reflector } from "@nestjs/core";
import type { ExecutionContext } from "@nestjs/common";
import { OperationGuard } from "../operation.guard.js";
import { OPERATION_METADATA } from "../../jsonapi/decorators.js";
import type { Principal } from "../../security/principal.js";
function fixture(auth?: "none" | "optional" | "required", permission?: string) {
  const handler = () => {};
  if (auth) Reflect.defineMetadata(OPERATION_METADATA, { auth, permission }, handler);
  const req: { headers: { authorization?: string }; principal?: Principal } = { headers: {} };
  let resolved: Principal | undefined;
  const guard = new OperationGuard(new Reflector(), { resolve: () => Promise.resolve(resolved) });
  const context = {
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return {
    req,
    run: () => guard.canActivate(context),
    set principal(p: Principal | undefined) {
      resolved = p;
    },
  };
}
it("Operation 선언이 없는 처리기는 인증을 생략해 실행하지 않는다", async () => {
  await expect(fixture().run()).rejects.toThrow("처리기에 Operation 선언이 없다");
});
it("선택 인증에 권한이 있으면 익명 요청도 403이다", async () => {
  await expect(fixture("optional", "roles:read").run()).rejects.toMatchObject({
    init: { status: 403, code: "permission.denied" },
  });
});
it("선택 인증의 해석 결과가 없으면 주체를 비우고 권한 요청을 거절한다", async () => {
  const f = fixture("optional", "roles:read");
  f.req.headers.authorization = "Bearer valid";
  f.req.principal = { userId: "old", sessionId: "old", permissions: new Set(["roles:read"]) };
  await expect(f.run()).rejects.toMatchObject({ init: { status: 403, code: "permission.denied" } });
  expect(f.req.principal).toBeUndefined();
});
it("필수 인증의 해석 결과가 없으면 Bearer 401이다", async () => {
  const f = fixture("required");
  f.req.headers.authorization = "Bearer valid";
  await expect(f.run()).rejects.toMatchObject({
    init: { status: 401, code: "auth.unauthenticated", headers: { "WWW-Authenticate": "Bearer" } },
  });
});
