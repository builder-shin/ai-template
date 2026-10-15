import { environment } from "../../scripts/child-environment.mjs";
import { z } from "zod";
export const mediaType = "application/vnd.api+json";
export const resource = z.object({
  data: z.object({
    id: z.string(),
    attributes: z.record(z.string(), z.unknown()),
    relationships: z.record(z.string(), z.unknown()).optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
  }),
});
export async function api(
  path: string,
  options: { method?: string; token?: string; data?: unknown } = {},
) {
  const response = await fetch(
    `${environment().E2E_API_URL ?? "http://127.0.0.1:18000"}/api/v1/${path}`,
    {
      method: options.method ?? "GET",
      headers: {
        Accept: mediaType,
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.data ? { "Content-Type": mediaType } : {}),
      },
      ...(options.data ? { body: JSON.stringify({ data: options.data }) } : {}),
      signal: AbortSignal.timeout(10000),
    },
  );
  const text = await response.text();
  return { status: response.status, body: text ? (JSON.parse(text) as unknown) : undefined };
}
export async function verificationToken(email: string): Promise<string | undefined> {
  const base = environment().E2E_MAILPIT_URL ?? "http://127.0.0.1:28025";
  for (const mail of await messagesFor(email)) {
    const detail = await fetch(`${base}/api/v1/message/${mail.ID}`, {
      signal: AbortSignal.timeout(5000),
    });
    const text = z.object({ Text: z.string() }).parse(await detail.json()).Text;
    const token = /\/verify-email\?token=([A-Za-z0-9_-]+)/.exec(text)?.[1];
    if (token) return token;
  }
  return undefined;
}
export async function messagesFor(email: string) {
  const base = environment().E2E_MAILPIT_URL ?? "http://127.0.0.1:28025";
  const listing = await fetch(`${base}/api/v1/messages`, { signal: AbortSignal.timeout(5000) });
  if (!listing.ok) throw new Error("Mailpit 목록을 읽지 못했다");
  const messages = z
    .object({
      messages: z.array(
        z.object({
          ID: z.string(),
          Subject: z.string(),
          To: z.array(z.object({ Address: z.string() })),
        }),
      ),
    })
    .parse(await listing.json());
  return messages.messages.filter((mail) => mail.To.some((to) => to.Address === email));
}
