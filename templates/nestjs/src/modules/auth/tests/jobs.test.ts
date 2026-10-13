import type { INestApplicationContext } from "@nestjs/common";
import { expect, it } from "vitest";
import { jobHandlers } from "../../../core/jobs/names.js";
import { AuthMails, registerAuthJobs } from "../index.js";
import { fixture, user, at } from "./fixtures.js";
it("인증 잡 등록은 서비스를 미리 찾지 않고 실행 때 id로 실제 메일을 준비한다", async () => {
  const f = fixture();
  f.addUser();
  let resolved = 0;
  const app = {
    get: (token: unknown) => {
      expect(token).toBe(AuthMails);
      resolved++;
      return f.mails;
    },
  } as unknown as INestApplicationContext;
  registerAuthJobs(app);
  expect(resolved).toBe(0);
  const handler = jobHandlers.get("auth.send_verification_mail");
  expect(handler).toBeDefined();
  await handler?.({ id: user.id }, { attempt: 1 });
  expect(resolved).toBe(1);
  expect(f.messages).toHaveLength(1);
  expect(f.state.tokens).toHaveLength(1);
});
it("환영 잡은 같은 이름의 처리기에 id만 넘겨 인증된 사용자의 메일을 보낸다", async () => {
  const f = fixture();
  f.addUser({ emailVerifiedAt: at });
  registerAuthJobs({ get: () => f.mails } as unknown as INestApplicationContext);
  const handler = jobHandlers.get("auth.send_welcome_mail");
  expect(handler).toBeDefined();
  await handler?.({ id: user.id }, { attempt: 1 });
  expect(f.messages[0]?.subject.trim()).toBe("가입을 환영합니다");
  expect(f.state.tokens).toEqual([]);
});
