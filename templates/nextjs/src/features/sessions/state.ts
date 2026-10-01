import type { FormResult } from "../../lib/api/errors";

export type SessionItem = {
  id: string;
  current: boolean;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
};
export type SessionsPage = {
  items: SessionItem[];
  previous: string | null;
  next: string | null;
};
export type SessionsResult = FormResult & {
  revokedCount?: number;
  retryAfter?: number | null;
};
export type SessionsAction = (state: SessionsResult, data: FormData) => Promise<SessionsResult>;
export type RevokeSessionAction = (
  id: string,
  state: SessionsResult,
  data: FormData,
) => Promise<SessionsResult>;
