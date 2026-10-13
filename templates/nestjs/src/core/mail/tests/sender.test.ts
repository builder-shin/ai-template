import { afterEach, expect, it, vi } from "vitest";
import type { Settings } from "../../config/settings.js";
const boundary = vi.hoisted(() => ({
  url: "",
  messages: [] as unknown[],
  failure: undefined as Error | undefined,
}));
vi.mock("nodemailer", () => ({
  createTransport: (url: string) => {
    boundary.url = url;
    return {
      sendMail: (message: unknown) => {
        if (boundary.failure) return Promise.reject(boundary.failure);
        boundary.messages.push(message);
        return Promise.resolve();
      },
    };
  },
}));
import { MailSender } from "../sender.js";
afterEach(() => {
  boundary.messages.length = 0;
  boundary.failure = undefined;
});
const settings = {
  SMTP_URL: "smtp://fixture.invalid:1025",
  MAIL_FROM: "앱 <sender@example.test>",
} as Settings;
it("설정의 SMTP 주소와 발신자를 사용해 메일의 세 형식을 보낸다", async () => {
  await new MailSender(settings).send({
    to: "recipient@example.test",
    subject: "제목",
    text: "본문",
    html: "<p>본문</p>",
  });
  expect(boundary.url).toBe("smtp://fixture.invalid:1025");
  expect(boundary.messages).toEqual([
    {
      from: "앱 <sender@example.test>",
      to: "recipient@example.test",
      subject: "제목",
      text: "본문",
      html: "<p>본문</p>",
    },
  ]);
});
it("SMTP 실패를 호출자에게 전한다", async () => {
  boundary.failure = new Error("SMTP 발송 실패");
  await expect(
    new MailSender(settings).send({
      to: "recipient@example.test",
      subject: "제목",
      text: "본문",
      html: "본문",
    }),
  ).rejects.toThrow("SMTP 발송 실패");
});
