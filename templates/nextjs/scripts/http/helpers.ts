import { inject } from "vitest";
import { appSessionCookieName } from "../../src/lib/app-config.mjs";
import { EXAMPLE_SESSION_SECRET } from "../../src/lib/env";
import { unsealSession } from "../../src/lib/session/cookie";
import { serverForm } from "../test/forms";

export { login, mockClient } from "../test/session";
export { serverForm } from "../test/forms";
export const base = inject("httpBaseUrl");

export function sessionHeaders(value: string) {
  return {
    Cookie: `${appSessionCookieName("development")}=${value}; NEXT_LOCALE=ko`,
    "Accept-Language": "ko",
  };
}

export async function responseSession(response: Response) {
  const prefix = `${appSessionCookieName("development")}=`;
  const header = response.headers.getSetCookie().find((value) => value.startsWith(prefix));
  const value = header?.split(";", 1)[0]?.slice(prefix.length);
  if (!value) throw new Error("응답에 새 세션 쿠키가 없다.");
  const session = await unsealSession(value, EXAMPLE_SESSION_SECRET);
  if (!session) throw new Error("응답 세션을 복호화하지 못했다.");
  return session;
}

export async function postForm(path: string, form: ReturnType<typeof serverForm>, cookie?: string) {
  return fetch(new URL(form.action || path, base), {
    method: "POST",
    body: form.body,
    redirect: "manual",
    headers: { Origin: base, "Accept-Language": "ko", ...(cookie ? sessionHeaders(cookie) : {}) },
  });
}
