import type { FormResult } from "../../lib/api/errors";

export type AuthResult = FormResult & {
  name?: string;
  email?: string;
  verificationEmail?: string;
  retryAfter?: number | null;
};
export type AuthAction = (state: AuthResult, data: FormData) => Promise<AuthResult>;
