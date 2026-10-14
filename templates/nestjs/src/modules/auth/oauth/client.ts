import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import { SETTINGS, type Settings } from "../../../core/config/settings.js";
import { providerSettings, type OAuthProvider } from "./providers.js";
export class OAuthHttpError extends Error {
  constructor(readonly status: number) {
    super("제공자 HTTP 요청에 실패했다");
    this.name = "OAuthHttpError";
  }
}
const tokenSchema = z.object({ access_token: z.string().min(1) });
@Injectable()
export class OAuthClient {
  constructor(@Inject(SETTINGS) private readonly settings: Settings) {}
  authorizeUrl(
    provider: OAuthProvider,
    params: { state: string; codeChallenge: string; redirectUri: string },
  ): string {
    const configured = providerSettings(this.settings, provider);
    const url = new URL(configured.authorizeUrl);
    const query = {
      client_id: configured.clientId,
      response_type: "code",
      scope: configured.scope,
      state: params.state,
      redirect_uri: params.redirectUri,
      code_challenge: params.codeChallenge,
      code_challenge_method: "S256",
    };
    for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
    return url.href;
  }
  async exchange(provider: OAuthProvider, code: string, verifier: string): Promise<string> {
    const configured = providerSettings(this.settings, provider);
    const response = await fetch(configured.tokenUrl, {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        redirect_uri: configured.callbackUrl,
        client_id: configured.clientId,
        client_secret: configured.clientSecret,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new OAuthHttpError(response.status);
    return tokenSchema.parse((await response.json()) as unknown).access_token;
  }
  async profile(provider: OAuthProvider, accessToken: string): Promise<unknown> {
    const configured = providerSettings(this.settings, provider);
    const response = await fetch(configured.profileUrl, {
      headers: { Authorization: "Bearer " + accessToken },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new OAuthHttpError(response.status);
    return response.json() as Promise<unknown>;
  }
}
