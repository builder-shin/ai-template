import { expectTypeOf, it } from "vitest";
import type { loginTestAccount, loginSeedAccount } from "../src/lib/testing/account";

it("로그인 도우미는 가입용 mailLink callback을 받지 않는다", () => {
  expectTypeOf<Parameters<typeof loginTestAccount>[0]>().not.toHaveProperty("mailLink");
  expectTypeOf<Parameters<typeof loginSeedAccount>[0]>().not.toHaveProperty("mailLink");
});
