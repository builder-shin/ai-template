import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
export const base = process.env.E2E_API_URL ?? "";
export function object(value: unknown): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}
export function string(value: unknown): string {
  assert.equal(typeof value, "string");
  return value as string;
}
export async function request(path: string, method = "GET", data?: unknown, token?: string) {
  const response = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: {
      Accept: "application/vnd.api+json",
      ...(data ? { "Content-Type": "application/vnd.api+json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(data ? { body: JSON.stringify({ data }) } : {}),
    signal: AbortSignal.timeout(5000),
  });
  const body: unknown = response.status === 204 ? null : await response.json();
  return { response, body };
}
export async function wait<T>(
  query: () => Promise<T>,
  ready: (value: T) => boolean,
  timeoutMs = 10000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await query();
    if (ready(value)) return value;
    if (Date.now() >= deadline) throw new Error("E2E condition timed out.");
    await sleep(20);
  }
}
export async function mailLink(email: string): Promise<string> {
  const mailpit = process.env.E2E_MAILPIT_URL ?? "";
  const found = await wait(
    async () => {
      const url = new URL(`${mailpit}/api/v1/search`);
      url.searchParams.set("query", `to:"${email}"`);
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, 200);
      return object(await response.json()).messages;
    },
    (messages) => Array.isArray(messages) && messages.length > 0,
  );
  assert(Array.isArray(found));
  const id = string(object(found[0]).ID);
  const response = await fetch(`${mailpit}/api/v1/message/${encodeURIComponent(id)}`, {
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 200);
  const text = string(object(await response.json()).Text);
  const link = /https?:\/\/[^\s<>]+\/verify-email\?token=[^\s<>]+/.exec(text)?.[0];
  assert(link, "Worker must send a verification link.");
  assert.equal(new URL(link).origin, process.env.E2E_WEB_URL);
  return link;
}
