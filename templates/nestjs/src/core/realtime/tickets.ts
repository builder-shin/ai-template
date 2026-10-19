import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import type { Principal } from "../security/principal.js";
import { PERMISSION_CODES } from "../security/permissions.js";
import { newOpaqueToken, hashOpaqueToken } from "../security/tokens.js";
import { RedisClients } from "../redis/clients.js";
const storedPrincipal = z.object({
  userId: z.string(),
  sessionId: z.string(),
  permissions: z.array(z.enum(PERMISSION_CODES)),
});
@Injectable()
export class TicketStore {
  constructor(@Inject(RedisClients) private readonly redis: RedisClients) {}
  async issue(principal: Principal): Promise<string> {
    const { token, hash } = newOpaqueToken();
    await this.redis.command.set(
      this.key(hash),
      JSON.stringify({ ...principal, permissions: [...principal.permissions] }),
      "EX",
      30,
    );
    return token;
  }
  async consume(ticket: string): Promise<Principal | undefined> {
    const value = await this.redis.command.getdel(this.key(hashOpaqueToken(ticket)));
    if (value === null) return undefined;
    let decoded: unknown;
    try {
      decoded = JSON.parse(value) as unknown;
    } catch {
      return undefined;
    }
    const parsed = storedPrincipal.safeParse(decoded);
    return parsed.success
      ? { ...parsed.data, permissions: new Set(parsed.data.permissions) }
      : undefined;
  }
  private key(hash: string): string {
    return `${this.redis.prefix}:realtime:ticket:${hash}`;
  }
}
