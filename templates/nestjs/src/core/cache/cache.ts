import { Inject, Injectable } from "@nestjs/common";
import { RedisClients } from "../redis/clients.js";
@Injectable()
export class CacheAside {
  constructor(@Inject(RedisClients) private readonly redis: RedisClients) {}
  async get<T>(namespace: string, key: string, shape: string): Promise<T | undefined> {
    try {
      return await this.read<T>(await this.address(namespace, key, shape));
    } catch {
      return undefined;
    }
  }
  async set(
    namespace: string,
    key: string,
    shape: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    const serialized = JSON.stringify(value);
    try {
      await this.write(await this.address(namespace, key, shape), serialized, ttlSeconds);
    } catch {
      /* 캐시는 실패해도 원본 요청을 계속한다. */
    }
  }
  async bump(namespace: string): Promise<void> {
    try {
      await this.redis.command.incr(this.generationKey(namespace));
    } catch {
      /* 세대 증가는 캐시 장애 때 원본 요청을 막지 않는다. */
    }
  }
  async remember<T>(
    namespace: string,
    key: string,
    shape: string,
    load: () => Promise<T>,
    ttlSeconds: number,
  ): Promise<T> {
    let address: string | undefined;
    try {
      address = await this.address(namespace, key, shape);
      const cached = await this.read<T>(address);
      if (cached !== undefined) return cached;
    } catch {
      /* Redis 장애와 손상된 캐시만 원본 조회로 넘긴다. */
    }
    const value = await load();
    const serialized = JSON.stringify(value);
    if (address !== undefined) {
      try {
        await this.write(address, serialized, ttlSeconds);
      } catch {
        /* 원본 응답은 캐시 저장 실패와 무관하게 반환한다. */
      }
    }
    return value;
  }
  private generationKey(namespace: string): string {
    return this.redis.key("cache", namespace, "generation");
  }
  private async address(namespace: string, key: string, shape: string): Promise<string> {
    const generation = (await this.redis.command.get(this.generationKey(namespace))) ?? "0";
    return this.redis.key("cache", namespace, generation, shape, key);
  }
  private async read<T>(address: string): Promise<T | undefined> {
    const raw = await this.redis.command.get(address);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  }
  private async write(address: string, serialized: string, ttlSeconds: number): Promise<void> {
    await this.redis.command.set(address, serialized, "EX", ttlSeconds);
  }
}
