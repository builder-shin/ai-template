import type { APIRequestContext, Page } from "@playwright/test";
import { z } from "zod";
import type { SocialProvider, TargetAdapter } from "./index";

const httpAddress = z.url({ protocol: /^https?$/ }).pipe(
  z.string().refine((value) => {
    const url = new URL(value);
    return (
      !url.hostname.includes("*") && !url.username && !url.password && !url.search && !url.hash
    );
  }),
);
const origin = httpAddress
  .pipe(z.string().refine((value) => new URL(value).pathname === "/"))
  .transform((value) => new URL(value).origin);
const settings = z.object({
  APP_URL: origin,
  API_BASE_URL: httpAddress.transform((value) => value.replace(/\/+$/, "")),
  E2E_MAILPIT_URL: origin,
  E2E_OAUTH_URL: origin,
  E2E_RECENT_LOGIN_SECONDS: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    // Node의 타이머 한도를 넘으면 즉시 끝나므로 상한도 검사한다.
    .pipe(z.number().int().min(1).max(2_147_483)),
});

export function parseFastapiTargetEnv(input: Record<string, string | undefined>) {
  const result = settings.safeParse(input);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(
      keys.map((key) => `${key}: FastAPI E2E의 URL 또는 양의 정수 창을 설정한다.`).join("\n"),
    );
  }
  const data = result.data;
  return {
    webOrigin: data.APP_URL,
    apiBaseUrl: data.API_BASE_URL,
    mailpitOrigin: data.E2E_MAILPIT_URL,
    oauthOrigin: data.E2E_OAUTH_URL,
    recentLoginSeconds: data.E2E_RECENT_LOGIN_SECONDS,
  };
}

const recipients = z.array(z.object({ Address: z.string() }));
const summaries = z.object({
  messages: z.array(
    z.object({
      ID: z.string().min(1),
      Created: z.string().refine((value) => Number.isFinite(Date.parse(value))),
    }),
  ),
});
const messageBody = z.object({ Text: z.string(), To: recipients });
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 전용 스택은 밖에서 준비한다. 이 어댑터는 URL·설정으로 부수 채널만 읽는다. */
export function fastapiTarget(
  request: APIRequestContext,
  input: Record<string, string | undefined> = process.env,
  options: { mailPollMs?: number; mailTimeoutMs?: number } = {},
): TargetAdapter {
  const config = parseFastapiTargetEnv(input);
  const mailTimeoutMs = options.mailTimeoutMs ?? 10_000;
  const mailPollMs = options.mailPollMs ?? 200;
  // 메일함 시계로 비교한다. 같은 밀리초의 재발송도 읽되 이미 반환한 ID는 다시 쓰지 않는다.
  const received = new Map<string, { time: number; ids: Set<string> }>();
  const timedOut = () => new Error("목적에 맞는 메일이 제한 시간 안에 없다.");

  async function readMail(path: string, deadline: number): Promise<unknown> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw timedOut();
    const response = await request
      .get(`${config.mailpitOrigin}${path}`, {
        timeout: remaining,
        maxRedirects: 0,
      })
      .catch(() => {
        throw new Error("Mailpit 요청이 실패했거나 제한 시간을 넘었다.");
      });
    try {
      if (!response.ok()) throw new Error(`Mailpit 조회 실패: ${response.status()}`);
      return await response.json();
    } finally {
      await response.dispose();
    }
  }

  async function providerPage(page: Page, provider: SocialProvider) {
    await page.waitForURL(
      (url) => url.origin === config.oauthOrigin && url.pathname === `/${provider}/authorize`,
    );
    const current = new URL(page.url());
    const states = current.searchParams.getAll("state");
    const redirects = current.searchParams.getAll("redirect_uri");
    const callback = `${config.apiBaseUrl}/oauth/${provider}/callback`;
    if (states.length !== 1 || !states[0] || redirects.length !== 1 || redirects[0] !== callback) {
      throw new Error("제공자 페이지의 state·redirect_uri가 현재 FastAPI 시도와 맞지 않는다.");
    }
    return { state: states[0], callback: new URL(redirects[0]) };
  }

  return {
    async mailLink(email, purpose) {
      const path = purpose === "verification" ? "/verify-email" : "/reset-password";
      const key = `${email.toLowerCase()}:${purpose}`;
      const previous = received.get(key);
      const deadline = Date.now() + mailTimeoutMs;
      const escaped = email.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
      const search = `/api/v1/search?query=${encodeURIComponent(`to:"${escaped}"`)}`;
      for (;;) {
        const parsed = summaries.safeParse(await readMail(search, deadline));
        if (!parsed.success) throw new Error("Mailpit 검색 응답의 ID·Created를 확인한다.");
        const latest = parsed.data.messages.sort(
          (a, b) => Date.parse(b.Created) - Date.parse(a.Created),
        );
        for (const summary of latest) {
          const time = Date.parse(summary.Created);
          if (previous && (time < previous.time || previous.ids.has(summary.ID))) continue;
          const body = messageBody.safeParse(
            await readMail(`/api/v1/message/${encodeURIComponent(summary.ID)}`, deadline),
          );
          if (!body.success) throw new Error("Mailpit 메일 응답의 Text·To를 확인한다.");
          if (!body.data.To.some((to) => to.Address.toLowerCase() === email.toLowerCase()))
            continue;
          for (const value of body.data.Text.match(/https?:\/\/[^\s<>"']+/g) ?? []) {
            let link: URL;
            try {
              link = new URL(value);
            } catch {
              continue;
            }
            if (link.pathname !== path || !link.searchParams.get("token")) continue;
            if (link.origin !== config.webOrigin || link.username || link.password) {
              throw new Error("메일 링크는 자격 증명 없는 web Origin이어야 한다.");
            }
            const ids = previous?.time === time ? previous.ids : new Set<string>();
            ids.add(summary.ID);
            received.set(key, { time, ids });
            return value;
          }
        }
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw timedOut();
        await sleep(Math.min(mailPollMs, remaining));
      }
    },
    async completeSocialLogin(page, provider, { username, name }) {
      await providerPage(page, provider);
      const claims = {
        google: { sub: username, name },
        kakao: { id: username, kakao_account: { profile: { nickname: name } } },
        naver: { response: { id: username, name } },
      }[provider];
      const form = page.locator("form").filter({ has: page.locator('input[name="username"]') });
      await form.locator('input[name="username"]').fill(username);
      const claimsField = form.locator('textarea[name="claims"]');
      if (!(await claimsField.isVisible())) await form.locator("details > summary").click();
      await claimsField.fill(JSON.stringify(claims));
      // 폼 제출·제공자→FastAPI→web 리다이렉트를 따른다. BFF의 PKCE 쿠키는 그대로 둔다.
      await form.locator('input[type="submit"]').click();
      await page.waitForURL((url) => url.origin === config.webOrigin);
    },
    async denySocialLogin(page, provider) {
      const { state, callback } = await providerPage(page, provider);
      // navikt에는 거부 버튼이 없다. 현재 시도만 FastAPI 콜백에 돌려준다.
      callback.searchParams.set("state", state);
      callback.searchParams.set("error", "access_denied");
      await page.goto(callback.href);
      await page.waitForURL((url) => url.origin === config.webOrigin);
    },
    async expireRecentLogin() {
      await sleep(config.recentLoginSeconds * 1000 + 100);
    },
  };
}
