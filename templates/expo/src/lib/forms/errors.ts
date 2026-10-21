import { ApiError } from "../api/errors";
import type { ErrorCode } from "../api/generated/error-codes";
import type ko from "../i18n/messages/ko.json";

export type MessageKey = keyof typeof ko;
/** Only locally constructed errors can select a UI key; remote errors use generated codes below. */
export class DisplayError extends Error {
  constructor(readonly key: MessageKey) {
    super("The operation could not be completed.");
    this.name = "DisplayError";
  }
}
const statusMessages: Partial<Record<number, MessageKey>> = {
  401: "signInRequired",
  403: "permissionDenied",
  409: "conflict",
  422: "invalidField",
  429: "rateLimited",
};
const messages = {
  "validation.required": "invalidField",
  "validation.too_short": "invalidField",
  "validation.too_long": "invalidField",
  "validation.invalid_format": "invalidField",
  "validation.out_of_range": "invalidField",
  "validation.invalid_choice": "invalidField",
  "validation.already_taken": "alreadyTaken",
  "auth.unauthenticated": "signInRequired",
  "auth.invalid_credentials": "invalidCredentials",
  "auth.email_not_verified": "emailNotVerified",
  "auth.account_deactivated": "accountDeactivated",
  "auth.reauthentication_required": "recentLoginRequired",
  "auth.verification_token_invalid": "invalidLink",
  "permission.denied": "permissionDenied",
  "resource.not_found": "notFound",
  "resource.conflict": "conflict",
  "rate_limit.exceeded": "rateLimited",
  "auth.oauth_code_invalid": "invalidLink",
  "auth.oauth_denied": "oauthDenied",
  "auth.oauth_failed": "error",
  "file.too_large": "fileTooLarge",
  "file.type_not_allowed": "fileTypeNotAllowed",
  "file.quota_exceeded": "fileQuotaExceeded",
  "file.upload_incomplete": "invalidUpload",
} satisfies Partial<Record<ErrorCode, MessageKey>>;
function codeKey(code: ErrorCode): MessageKey | undefined {
  return Object.hasOwn(messages, code) ? messages[code as keyof typeof messages] : undefined;
}
export function errorKey(error: unknown): MessageKey {
  if (error instanceof DisplayError) return error.key;
  if (error instanceof ApiError)
    return (
      (error.errors[0] && codeKey(error.errors[0].code)) ?? statusMessages[error.status] ?? "error"
    );
  if (error instanceof Error && error.name === "SessionStorageError") return "secureStorageError";
  return error instanceof TypeError ? "offline" : "error";
}
export function fieldError(error: unknown, field: string): MessageKey | undefined {
  if (!(error instanceof ApiError)) return;
  const item = error.errors.find((item) => item.source?.pointer === `/data/attributes/${field}`);
  return item ? (codeKey(item.code) ?? "invalidField") : undefined;
}
