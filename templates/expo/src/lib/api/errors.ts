import type { ErrorCode } from "./generated/error-codes";

export interface RemoteError {
  code: ErrorCode;
  source?: { pointer?: string };
  meta?: { params?: Record<string, unknown> };
}
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly errors: readonly RemoteError[] = [],
  ) {
    super(`API request failed (${status}).`);
    this.name = "ApiError";
  }
  static async fromResponse(response: Response): Promise<ApiError> {
    const body: unknown = await response.json().catch(() => null);
    const errors =
      body && typeof body === "object" && "errors" in body && Array.isArray(body.errors)
        ? (body.errors as RemoteError[])
        : [];
    return new ApiError(response.status, errors);
  }
  fieldErrors(): Record<string, string> {
    return Object.fromEntries(
      this.errors.flatMap((error) => {
        const pointer = error.source?.pointer;
        return pointer?.startsWith("/data/attributes/")
          ? [[pointer.slice("/data/attributes/".length), error.code]]
          : [];
      }),
    );
  }
}
