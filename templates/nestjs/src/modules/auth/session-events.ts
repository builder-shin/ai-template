import type { AfterCommit } from "../../core/db/unit-of-work.js";
export const SESSION_REVOKED_REASONS = [
  "logout",
  "password_reset",
  "account_deactivated",
  "revoked",
  "password_changed",
  "refresh_token_reused",
  "account_deleted",
] as const;
export type SessionRevokedReason = (typeof SESSION_REVOKED_REASONS)[number];
export interface SessionRevocation {
  userId: string;
  sessionIds: readonly string[];
  reason: SessionRevokedReason;
}
type Listener = (afterCommit: AfterCommit, revocation: SessionRevocation) => void;
const listeners = new Set<Listener>();
export function onSessionsRevoked(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function sessionsRevoked(afterCommit: AfterCommit, revocation: SessionRevocation): void {
  for (const listener of listeners) listener(afterCommit, revocation);
}
