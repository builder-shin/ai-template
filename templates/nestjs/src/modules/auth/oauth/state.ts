import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import { RedisClients } from "../../../core/redis/clients.js";
import { newOpaqueToken, hashOpaqueToken } from "../../../core/security/tokens.js";
import { OAUTH_PROVIDERS, CODE_CHALLENGE_PATTERN } from "./providers.js";
const provider = z.enum(OAUTH_PROVIDERS);
const challenge = z.string().regex(CODE_CHALLENGE_PATTERN);
const stateSchema = z.object({
  provider,
  redirectUri: z.url(),
  verifier: z.string(),
  codeChallenge: challenge,
});
const codeSchema = z.object({ userId: z.string(), provider, codeChallenge: challenge });
type StoredState = z.infer<typeof stateSchema>;
type StoredCode = z.infer<typeof codeSchema>;
@Injectable()
export class OAuthState {
  constructor(@Inject(RedisClients) private readonly redis: RedisClients) {}
  async issueState(value: StoredState): Promise<string> {
    const { token, hash } = newOpaqueToken();
    await this.redis.command.set(
      this.redis.key("oauth", "state", hash),
      JSON.stringify(value),
      "EX",
      600,
    );
    return token;
  }
  consumeState(token: string): Promise<StoredState | undefined> {
    return this.consume("state", token, stateSchema);
  }
  async issueCode(value: StoredCode): Promise<string> {
    const { token, hash } = newOpaqueToken();
    await this.redis.command.set(
      this.redis.key("oauth", "code", hash),
      JSON.stringify(value),
      "EX",
      60,
    );
    return token;
  }
  consumeCode(token: string): Promise<StoredCode | undefined> {
    return this.consume("code", token, codeSchema);
  }
  private async consume<T>(
    kind: string,
    token: string,
    schema: z.ZodType<T>,
  ): Promise<T | undefined> {
    const hash = hashOpaqueToken(token);
    const raw = await this.redis.command.getdel(this.redis.key("oauth", kind, hash));
    if (raw === null) return undefined;
    try {
      const decoded = schema.safeParse(JSON.parse(raw) as unknown);
      return decoded.success ? decoded.data : undefined;
    } catch {
      return undefined;
    }
  }
}
