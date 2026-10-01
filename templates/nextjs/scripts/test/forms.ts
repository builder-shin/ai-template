import { expect } from "vitest";

function decode(value: string) {
  const entities: Record<string, string> = {
    "&quot;": '"',
    "&#x27;": "'",
    "&#39;": "'",
    "&lt;": "<",
    "&gt;": ">",
    "&amp;": "&",
  };
  return value.replace(/&quot;|&#x27;|&#39;|&lt;|&gt;|&amp;/g, (match) => entities[match]!);
}

/** 실제 SSR 폼의 hidden 필드와 action을 쓴다. JS·Action ID 대체는 없다. */
export function serverForm(
  html: string,
  kind: "login" | "logout" | "resend" | "signup" | "verify" | "request-reset" | "reset",
) {
  const form = Array.from(html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)).find((match) =>
    kind === "signup"
      ? /name="name"/.test(match[2]!)
      : kind === "verify" || kind === "reset"
        ? /name="token"/.test(match[2]!)
        : kind === "logout"
          ? match[1]!.includes('id="logout-form"')
          : kind === "login" || kind === "request-reset"
            ? /type="email"/.test(match[2]!)
            : /name="email"/.test(match[2]!) && !/type="email"/.test(match[2]!),
  );
  if (!form) throw new Error(`${kind} 서버 폼이 없다.`);
  const body = new FormData();
  for (const input of form[2]!.matchAll(/<input\b[^>]*>/g)) {
    const attributes = Object.fromEntries(
      Array.from(input[0].matchAll(/([\w$:-]+)="([^"]*)"/g), (entry) => [
        entry[1],
        decode(entry[2]!),
      ]),
    );
    if (attributes.type === "hidden" && attributes.name)
      body.append(attributes.name, attributes.value ?? "");
  }
  expect(Array.from(body.keys()).some((name) => name.startsWith("$ACTION_"))).toBe(true);
  const action = form[1]!.match(/action="([^"]*)"/)?.[1];
  return { body, action: action ? decode(action) : "" };
}
