import { z } from "zod";
import type { MobileEnv } from "../src/lib/config/env.ts";
import { parseAppLink } from "../src/lib/links/parse.ts";

type MailKind = "verify-email" | "reset-password";
export function nativeLinkFromMail(text: string, kind: MailKind, config: MobileEnv): string | null {
  for (const url of text.match(/https?:\/\/[^\s<>"']+/g) ?? []) {
    const parsed = parseAppLink(url, config);
    if (parsed?.kind === kind)
      return `${config.scheme}://${kind}?${new URLSearchParams({ token: parsed.value })}`;
  }
  return null;
}
const mailbox = z.object({ messages: z.array(z.object({ to: z.string(), text: z.string() })) });
/** For owned development/CI mock servers only. The returned link must never be logged. */
export async function readMockMailLink(input: {
  apiOrigin: string;
  to: string;
  kind: MailKind;
  config: MobileEnv;
}): Promise<string> {
  const origin = new URL(input.apiOrigin);
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/"
  )
    throw new Error("Use an explicit mock server origin.");
  const url = new URL("/_test/mail", origin);
  url.searchParams.set("to", input.to);
  const response = await fetch(url, {
    redirect: "error",
    credentials: "omit",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Mock mailbox unavailable.");
  const result = mailbox.safeParse(await response.json());
  if (!result.success) throw new Error("Mock mailbox response invalid.");
  for (const mail of result.data.messages) {
    if (mail.to.toLowerCase() !== input.to.toLowerCase()) continue;
    const link = nativeLinkFromMail(mail.text, input.kind, input.config);
    if (link) return link;
  }
  throw new Error("No matching app link found in the owned mock mailbox.");
}
