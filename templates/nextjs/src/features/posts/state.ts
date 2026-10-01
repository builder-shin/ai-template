import type { FormResult } from "../../lib/api/errors";

export type PostValues = { title: string; body: string; coverImage?: string };
export type PostResult = FormResult & {
  values?: PostValues;
  invalidTransition?: boolean;
  retryAfter?: number | null;
};
export type PostAction = (state: PostResult, data: FormData) => Promise<PostResult>;
