import type { OAuthProvider, ProviderIdentity } from "./providers.js";
function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
function subject(value: unknown): string {
  const found =
    text(value) ??
    (typeof value === "number" && Number.isSafeInteger(value) ? String(value) : null);
  if (found === null) throw new Error("제공자 신원에 subject가 없다");
  return found;
}
export function identityFrom(provider: OAuthProvider, profile: unknown): ProviderIdentity {
  const raw = record(profile);
  if (provider === "google") {
    const email = text(raw.email);
    return {
      subject: subject(raw.sub),
      email,
      name: text(raw.name),
      emailVerified:
        email !== null &&
        raw.email_verified === true &&
        (email.toLowerCase().endsWith("@gmail.com") || text(raw.hd) !== null),
    };
  }
  if (provider === "kakao") {
    const account = record(raw.kakao_account);
    const email = text(account.email);
    return {
      subject: subject(raw.id),
      email,
      name: text(record(account.profile).nickname),
      emailVerified:
        email !== null && account.is_email_valid === true && account.is_email_verified === true,
    };
  }
  const response = record(raw.response);
  return {
    subject: subject(response.id),
    email: text(response.email),
    emailVerified: false,
    name: text(response.name),
  };
}
