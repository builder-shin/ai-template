import type { FormResult } from "../api/errors";
export type LocaleState = FormResult & { retryAfter?: number | null };
export type LoginState = FormResult & {
  email?: string;
  noAccess?: boolean;
  retryAfter?: number | null;
};
export type LoginAction = (state: LoginState, data: FormData) => Promise<LoginState>;
