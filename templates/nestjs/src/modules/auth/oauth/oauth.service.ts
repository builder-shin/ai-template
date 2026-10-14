import { z } from "zod";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { UnitOfWork } from "../../../core/db/unit-of-work.js";
import { isUniqueViolation } from "../../../core/db/errors.js";
import { SETTINGS, type Settings } from "../../../core/config/settings.js";
import type { Locale } from "../../../core/config/locale.js";
import { ApiError } from "../../../core/jsonapi/errors.js";
import { newOpaqueToken } from "../../../core/security/tokens.js";
import { providerSettings, type OAuthProvider } from "./providers.js";
import { OAuthState } from "./state.js";
import { OAuthClient, OAuthHttpError } from "./client.js";
import { identityFrom } from "./identity.js";
import { linkAccount } from "./link.js";
import { challengeFor } from "./pkce.js";
function invalid(parameter: string): never {
  throw new ApiError({
    status: 400,
    code: "jsonapi.invalid_query",
    title: "소셜 로그인 쿼리가 올바르지 않다",
    source: { parameter },
  });
}
function redirect(target: string, name: "code" | "error", value: string): string {
  const url = new URL(target);
  url.searchParams.delete("code");
  url.searchParams.delete("error");
  url.searchParams.set(name, value);
  return url.href;
}
@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);
  constructor(
    @Inject(UnitOfWork) private readonly unit: UnitOfWork,
    @Inject(OAuthState) private readonly state: OAuthState,
    @Inject(OAuthClient) private readonly client: OAuthClient,
    @Inject(SETTINGS) private readonly settings: Settings,
  ) {}
  async authorize(
    provider: OAuthProvider,
    query: { redirectUri: string; codeChallenge: string },
  ): Promise<string> {
    if (!this.settings.OAUTH_REDIRECT_URIS.includes(query.redirectUri)) invalid("redirectUri");
    if (!/^[A-Za-z0-9_-]{43}$/.test(query.codeChallenge)) invalid("codeChallenge");
    const { token: verifier } = newOpaqueToken();
    const state = await this.state.issueState({ provider, verifier, ...query });
    return this.client.authorizeUrl(provider, {
      state,
      codeChallenge: challengeFor(verifier),
      redirectUri: providerSettings(this.settings, provider).callbackUrl,
    });
  }
  async callback(
    provider: OAuthProvider,
    query: { state?: string | undefined; code?: string | undefined; error?: string | undefined },
    locale: Locale = "ko",
  ): Promise<string> {
    if (!query.state) invalid("state");
    const stored = await this.state.consumeState(query.state);
    if (!stored || stored.provider !== provider) invalid("state");
    const failed = (code: string) => redirect(stored.redirectUri, "error", code);
    if (query.error === "access_denied") return failed("auth.oauth_denied");
    if (query.error !== undefined || !query.code) return failed("auth.oauth_failed");
    let phase: "exchange" | "profile" | "identity" | "link" | "issue_code" = "exchange";
    try {
      const token = await this.client.exchange(provider, query.code, stored.verifier);
      phase = "profile";
      const profile = await this.client.profile(provider, token);
      phase = "identity";
      const identity = identityFrom(provider, profile);
      phase = "link";
      const link = () => this.unit.run((tx) => linkAccount(tx, provider, identity, locale));
      const user = await link().catch((error: unknown) => {
        if (!isUniqueViolation(error)) throw error;
        // PostgreSQL 오류로 중단된 트랜잭션은 롤백한 뒤 한 번만 다시 연다.
        return link();
      });
      if (user.status !== "active") return failed("auth.account_deactivated");
      phase = "issue_code";
      const code = await this.state.issueCode({
        userId: user.userId,
        provider,
        codeChallenge: stored.codeChallenge,
      });
      return redirect(stored.redirectUri, "code", code);
    } catch (error) {
      this.logger.warn({
        message: "소셜 로그인 콜백이 실패했다",
        provider,
        phase,
        ...safeFailure(error),
      });
      return failed("auth.oauth_failed");
    }
  }
}

function safeFailure(error: unknown): {
  errorType: string;
  errorCode?: string;
  httpStatus?: number;
} {
  try {
    const errorType =
      error instanceof OAuthHttpError
        ? "OAuthHttpError"
        : error instanceof z.ZodError
          ? "ZodError"
          : error instanceof TypeError
            ? "TypeError"
            : error instanceof SyntaxError
              ? "SyntaxError"
              : error instanceof RangeError
                ? "RangeError"
                : error instanceof DOMException &&
                    (error.name === "TimeoutError" || error.name === "AbortError")
                  ? error.name
                  : error instanceof Error
                    ? "Error"
                    : "unknown";
    // 임의 오류의 getter·메시지·스택·cause·페이로드는 읽거나 직렬화하지 않는다.
    const code: unknown =
      typeof error === "object" && error !== null
        ? Object.getOwnPropertyDescriptor(error, "code")?.value
        : undefined;
    const allowedCodes = [
      "P2002",
      "P2024",
      "P2028",
      "P1000",
      "P1001",
      "P1002",
      "P1017",
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
    ];
    const errorCode = typeof code === "string" && allowedCodes.includes(code) ? code : undefined;
    const httpStatus =
      error instanceof OAuthHttpError &&
      Number.isInteger(error.status) &&
      error.status >= 100 &&
      error.status <= 599
        ? error.status
        : undefined;
    return {
      errorType,
      ...(errorCode === undefined ? {} : { errorCode }),
      ...(httpStatus === undefined ? {} : { httpStatus }),
    };
  } catch {
    return { errorType: "unknown" };
  }
}
