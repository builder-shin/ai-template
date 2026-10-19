import type { Settings } from "../../../core/config/settings.js";
export const OAUTH_PROVIDERS = ["google", "kakao", "naver"] as const;
export const CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];
export interface ProviderIdentity {
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}
export function providerSettings(settings: Settings, provider: OAuthProvider) {
  const prefix = { google: "OAUTH_GOOGLE", kakao: "OAUTH_KAKAO", naver: "OAUTH_NAVER" }[
    provider
  ] as "OAUTH_GOOGLE" | "OAUTH_KAKAO" | "OAUTH_NAVER";
  return {
    clientId: settings[`${prefix}_CLIENT_ID`],
    clientSecret: settings[`${prefix}_CLIENT_SECRET`],
    authorizeUrl: settings[`${prefix}_AUTHORIZE_URL`],
    tokenUrl: settings[`${prefix}_TOKEN_URL`],
    profileUrl: settings[`${prefix}_PROFILE_URL`],
    scope: {
      google: "openid email profile",
      kakao: "openid profile_nickname account_email",
      naver: "openid",
    }[provider],
    callbackUrl: settings.API_URL.replace(/\/$/, "") + "/api/v1/oauth/" + provider + "/callback",
  };
}
