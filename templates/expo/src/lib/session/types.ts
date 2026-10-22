import type { components } from "../api/generated/schema";

export type SessionGrant = components["schemas"]["SessionGrant"];
export type SessionTokens = components["schemas"]["SessionWithTokensDocument"];
export interface StoredSession {
  sessionId: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}
export interface SessionStore {
  read(): Promise<StoredSession | null>;
  write(value: StoredSession): Promise<void>;
  clear(): Promise<void>;
}
export interface SessionTransport {
  grant(input: SessionGrant, signal: AbortSignal): Promise<SessionTokens>;
  revoke(sessionId: string, accessToken: string): Promise<void>;
}
export interface SessionSnapshot {
  status: "restoring" | "anonymous" | "authenticated";
  generation: number;
  sessionId: string | null;
  networkError: boolean;
  storageError: boolean;
}
export class SessionStorageError extends Error {
  constructor() {
    super("Secure session storage unavailable. Please retry or sign in again.");
    this.name = "SessionStorageError";
  }
}
