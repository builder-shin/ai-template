import type { INestApplicationContext } from "@nestjs/common";
import { expect, it, vi } from "vitest";
import * as templates from "../../../core/mail/templates.js";
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
  expect(f.messages[0]?.subject).toBe("가입을 환영합니다");
  expect(f.state.tokens).toEqual([]);
});
it.each([
  ["ko", "인증", "auth.send_verification_mail", "이메일을 인증해 주세요"],
  ["en", "인증", "auth.send_verification_mail", "Please verify your email"],
  ["ko", "환영", "auth.send_welcome_mail", "가입을 환영합니다"],
  ["en", "환영", "auth.send_welcome_mail", "Welcome"],
] as const)(
  "%s %s 잡은 끝 개행 없는 정확한 제목을 발송한다",
  async (locale, kind, name, expected) => {
    const f = fixture();
    f.addUser({ locale, emailVerifiedAt: kind === "환영" ? at : null });
    registerAuthJobs({ get: () => f.mails } as unknown as INestApplicationContext);
    const handler = jobHandlers.get(name);
    expect(handler).toBeDefined();
    await handler?.({ id: user.id }, { attempt: 1 });
    expect(f.messages).toHaveLength(1);
    expect(f.messages[0]?.subject).toBe(expected);
  },
);
it("제목 끝 CR과 LF만 지우고 양끝의 일반 공백과 본문은 보존한다", async () => {
  const loaded = vi.spyOn(templates, "loadMailTemplates").mockReturnValue({
    subject: "  표제  \r\n\n",
    text: "그대로 {{greeting}}\n",
    html: "<p>{{greeting}}</p>\n",
  });
  const f = fixture();
  f.addUser({ emailVerifiedAt: at });
  try {
    await f.mails.sendWelcome(user.id);
    expect(f.messages[0]?.subject).toBe("  표제  ");
    expect(f.messages[0]?.text).toBe("그대로 <민수>님, 안녕하세요.\n");
    expect(f.messages[0]?.html).toBe("<p>&lt;민수&gt;님, 안녕하세요.</p>\n");
  } finally {
    loaded.mockRestore();
  }
});
