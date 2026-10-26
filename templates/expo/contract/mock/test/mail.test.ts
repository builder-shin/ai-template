/** 메일 보관함과 테스트 통로(/_test/mail). */

import { describe, expect, it } from "vitest";
import { createOutbox } from "../src/mail/outbox.ts";
import { testApp } from "./support.ts";

interface MailList {
  messages: { id: string; to: string; subject: string; text: string; receivedAt: string }[];
}

async function listMail(app: ReturnType<typeof testApp>["app"], query = ""): Promise<MailList> {
  const response = await app.request(`/_test/mail${query}`);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/json");
  return (await response.json()) as MailList;
}

describe("메일 보관함", () => {
  it("보관한 메일을 최신순으로 주고, 받는 사람(대소문자 무시)으로 거른다", () => {
    const outbox = createOutbox();
    const first = outbox.send({ to: "a@example.com", subject: "하나", text: "1" });
    const second = outbox.send({ to: "b@example.com", subject: "둘", text: "2" });
    const third = outbox.send({ to: "a@example.com", subject: "셋", text: "3" });
    expect(outbox.list()).toEqual([third, second, first]);
    expect(outbox.list("A@Example.com")).toEqual([third, first]);
    outbox.clear();
    expect(outbox.list()).toEqual([]);
  });

  it("메일마다 id와 받은 시각(ISO 8601)을 붙인다", () => {
    const outbox = createOutbox();
    const mail = outbox.send({ to: "a@example.com", subject: "제목", text: "본문" });
    expect(mail).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
      to: "a@example.com",
      subject: "제목",
      text: "본문",
      receivedAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/) as unknown,
    });
  });
});

describe("/_test/mail", () => {
  it("보관한 메일을 JSON으로 주고, to로 거른다", async () => {
    const { app, state } = testApp();
    const verify = state.outbox.send({
      to: "user@example.com",
      subject: "이메일 주소를 확인해 주세요",
      text: "http://localhost:3000/verify-email?token=abc", // betterleaks:allow 테스트용 가짜 토큰
    });
    const other = state.outbox.send({ to: "other@example.com", subject: "다른", text: "x" });
    expect(await listMail(app)).toEqual({ messages: [other, verify] });
    const query = `?to=${encodeURIComponent("user@example.com")}`;
    expect(await listMail(app, query)).toEqual({ messages: [verify] });
  });

  it("DELETE는 보관함을 비운다", async () => {
    const { app, state } = testApp();
    state.outbox.send({ to: "user@example.com", subject: "제목", text: "본문" });
    const response = await app.request("/_test/mail", { method: "DELETE" });
    expect(response.status).toBe(204);
    expect(await listMail(app)).toEqual({ messages: [] });
  });

  it("MOCK_TEST_ENDPOINTS가 꺼져 있으면 없는 경로다", async () => {
    const { app } = testApp({ testEndpoints: false });
    const response = await app.request("/_test/mail");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ detail: "Not Found" });
  });
});
