import type { components } from "../api/generated/schema";
import type { SessionStore, StoredSession } from "./types";

export const passwordGrant = {
  grantType: "password",
  email: "member@example.com",
  password: "fixture-password-123!", // betterleaks:allow
} as const;
export function tokens(id: string): components["schemas"]["SessionWithTokensDocument"] {
  return {
    data: {
      type: "sessions",
      id,
      attributes: {
        userAgent: null,
        createdAt: "2026-01-01T00:00:00Z",
        lastUsedAt: "2026-01-01T00:00:00Z",
        current: true,
        accessToken: `access-${id}`,
        accessTokenExpiresAt: "2099-01-01T00:00:00Z",
        refreshToken: `refresh-${id}`,
        refreshTokenExpiresAt: "2099-01-01T00:00:00Z",
      },
      relationships: { user: { data: { type: "users", id: `user-${id}` } } },
    },
  };
}
export function record(id: string): StoredSession {
  return {
    sessionId: id,
    refreshToken: `refresh-${id}`,
    refreshTokenExpiresAt: "2099-01-01T00:00:00Z",
  };
}
export function memoryStore(
  initial: StoredSession | null = null,
): SessionStore & { value: StoredSession | null } {
  return {
    value: initial,
    async read() {
      return this.value;
    },
    async write(value) {
      this.value = value;
    },
    async clear() {
      this.value = null;
    },
  };
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
