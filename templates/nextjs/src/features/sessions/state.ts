import type { FormResult } from "../../lib/api/errors";

// 계약의 page[number]는 int32다.
const PAGE_NUMBER_MAX = 2_147_483_647;

export function parseSessionsPage(input: string | string[] | undefined): number {
  const number = Number(Array.isArray(input) ? input[0] : input);
  return Number.isSafeInteger(number) && number > 0 && number <= PAGE_NUMBER_MAX ? number : 1;
}

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
