import { SettingsError } from "../config/settings.js";
const categories = {
  AccessDenied: "access_denied",
  SignatureDoesNotMatch: "signature",
  InvalidAccessKeyId: "credentials",
  CredentialsProviderError: "credentials",
  ExpiredToken: "credentials",
  SlowDown: "throttled",
  Throttling: "throttled",
  RequestTimeout: "timeout",
  TimeoutError: "timeout",
  ETIMEDOUT: "timeout",
  AbortError: "cancelled",
  ECONNREFUSED: "connection",
  ECONNRESET: "connection",
  EHOSTUNREACH: "connection",
  ENETUNREACH: "connection",
  ECONNABORTED: "connection",
  ENOTFOUND: "connection",
  EAI_AGAIN: "connection",
  NoSuchBucket: "missing_bucket",
} as const;
type Category = (typeof categories)[keyof typeof categories] | "configuration" | "http" | "unknown";
function ownData(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? Object.getOwnPropertyDescriptor(value, key)?.value
    : undefined;
}
/** 오류의 accessor·원문·페이로드를 실행하거나 기록하지 않는다. */
export function storageFailure(error: unknown): { category: Category; httpStatus?: number } {
  try {
    const status = ownData(ownData(error, "$metadata"), "httpStatusCode");
    const httpStatus =
      typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599
        ? status
        : undefined;
    let category: Category =
      error instanceof SettingsError
        ? "configuration"
        : httpStatus === undefined
          ? "unknown"
          : "http";
    for (const key of ["name", "code"]) {
      const value = ownData(error, key);
      if (typeof value === "string" && Object.hasOwn(categories, value)) {
        category = categories[value as keyof typeof categories];
        break;
      }
    }
    return { category, ...(httpStatus === undefined ? {} : { httpStatus }) };
  } catch {
    return { category: "unknown" };
  }
}
