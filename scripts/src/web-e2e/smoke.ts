import { setTimeout as sleep } from "node:timers/promises";
import { record } from "./config.ts";
import { type Plan } from "./plan.ts";

/** HTTP 조회는 값을 출력하지 않고 짧은 요청 제한과 전체 대기 제한을 함께 쓴다. */
async function request(
  url: string,
  options: RequestInit = {},
  signal?: AbortSignal,
): Promise<Response> {
  signal?.throwIfAborted();
  const timeout = AbortSignal.timeout(2_000);
  return fetch(url, { ...options, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
}

export async function waitForServices(plan: Plan, signal?: AbortSignal): Promise<void> {
  const URLS = plan.urls;
  for (const url of [
    `${URLS.api}/health/ready`,
    `${URLS.mail}/readyz`,
    ...(URLS.oauth ? [`${URLS.oauth}/default/.well-known/openid-configuration`] : []),
  ]) {
    const deadline = Date.now() + 60_000;
    for (;;) {
      signal?.throwIfAborted();
      try {
        const response = await request(url, {}, signal);
        await response.arrayBuffer();
        if (response.ok) break;
      } catch {
        signal?.throwIfAborted();
      }
      if (Date.now() >= deadline) throw new Error(`${url}: 준비 확인이 60초를 넘었다.`);
      await sleep(200, undefined, signal ? { signal } : {});
    }
  }
}

export async function smoke(plan: Plan, signal?: AbortSignal): Promise<number> {
  const URLS = plan.urls;
  const posts = await request(
    `${URLS.api}/api/v1/posts`,
    { headers: { Accept: "application/vnd.api+json" } },
    signal,
  );
  const seeded = record(await posts.json()).data;
  if (!posts.ok || !Array.isArray(seeded) || seeded.length < 2)
    throw new Error("발행된 시드 글 두 개가 있어야 한다.");

  const cors = await request(
    `${URLS.s3}/app/smoke`,
    {
      method: "OPTIONS",
      headers: {
        Origin: URLS.web,
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "content-type",
      },
    },
    signal,
  );
  await cors.arrayBuffer();
  const methods = cors.headers.get("access-control-allow-methods")?.split(/,\s*/) ?? [];
  if (
    !cors.ok ||
    cors.headers.get("access-control-allow-origin") !== URLS.web ||
    !methods.includes("PUT")
  ) {
    throw new Error("스토리지 CORS는 앱 Origin의 PUT을 허용해야 한다.");
  }

  const email = `stack-${plan.runId}@example.com`;
  const registered = await request(
    `${URLS.api}/api/v1/registrations`,
    {
      method: "POST",
      headers: { Accept: "application/vnd.api+json", "Content-Type": "application/vnd.api+json" },
      body: JSON.stringify({
        data: {
          type: "registrations",
          attributes: {
            email,
            password: "stack-smoke-password", // betterleaks:allow 전용 스택의 가짜 비밀번호
            name: "Stack smoke",
            locale: "en",
          },
        },
      }),
    },
    signal,
  );
  await registered.arrayBuffer();
  if (registered.status !== 201)
    throw new Error(`메일 smoke 가입 실패: HTTP ${String(registered.status)}`);
  const deadline = Date.now() + 30_000;
  for (;;) {
    signal?.throwIfAborted();
    const search = new URL(`${URLS.mail}/api/v1/search`);
    search.searchParams.set("query", `to:"${email}"`);
    const found = await request(search.href, {}, signal);
    const messages = record(await found.json()).messages;
    if (!found.ok) throw new Error("Mailpit 검색이 실패했다.");
    if (Array.isArray(messages) && messages.length > 0) {
      const id = record(messages[0] as unknown).ID;
      if (typeof id !== "string") throw new Error("Mailpit 메일 ID가 없다.");
      const received = await request(
        `${URLS.mail}/api/v1/message/${encodeURIComponent(id)}`,
        {},
        signal,
      );
      const text = record(await received.json()).Text;
      if (
        !received.ok ||
        typeof text !== "string" ||
        !text.includes(`${URLS.web}/verify-email?token=`)
      ) {
        throw new Error("인증 메일 링크는 앱 주소여야 한다.");
      }
      break;
    }
    if (Date.now() >= deadline) throw new Error("worker가 30초 안에 인증 메일을 보내야 한다.");
    await sleep(200, undefined, signal ? { signal } : {});
  }
  console.log(
    `smoke 통과: API·시드·Mailpit${URLS.oauth ? "·OAuth" : ""}·worker 메일·스토리지 CORS`,
  );
  return 0;
}
