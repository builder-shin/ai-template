import * as SecureStore from "expo-secure-store";
import { z } from "zod";

export interface OAuthPending {
  provider: "google" | "kakao" | "naver";
  verifier: string;
  createdAt: number;
}
export interface PendingStore {
  read(): Promise<OAuthPending | null>;
  write(value: OAuthPending): Promise<void>;
  take(): Promise<OAuthPending | null>;
  clear(expectedVerifier?: string): Promise<void>;
}
const schema = z
  .object({
    provider: z.enum(["google", "kakao", "naver"]),
    verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
    createdAt: z.number().int().nonnegative(),
  })
  .strict();
const key = "ai-template.oauth-pending.v1";
const options = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: key,
};
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const job = queue.then(work);
  queue = job.catch(() => undefined);
  return job;
}
export class PendingStorageError extends Error {
  constructor() {
    super("Authentication handoff storage unavailable. Please retry.");
  }
}
export function createPendingStore(
  native: Pick<
    typeof SecureStore,
    "getItemAsync" | "setItemAsync" | "deleteItemAsync"
  > = SecureStore,
): PendingStore {
  const read = async (): Promise<OAuthPending | null> => {
    const raw = await native.getItemAsync(key, options);
    if (!raw) return null;
    try {
      const parsed = schema.safeParse(JSON.parse(raw) as unknown);
      if (parsed.success) return parsed.data;
    } catch {
      /* Malformed record is removed below. */
    }
    await native.deleteItemAsync(key, options);
    return null;
  };
  const safe = <T>(work: () => Promise<T>) =>
    serial(async () => {
      try {
        return await work();
      } catch {
        throw new PendingStorageError();
      }
    });
  return {
    read: () => safe(read),
    write: (value) =>
      safe(async () => {
        const parsed = schema.safeParse(value);
        if (!parsed.success) throw new PendingStorageError();
        await native.setItemAsync(key, JSON.stringify(parsed.data), options);
      }),
    take: () =>
      safe(async () => {
        const value = await read();
        await native.deleteItemAsync(key, options);
        return value;
      }),
    clear: (expected) =>
      safe(async () => {
        if (expected && (await read())?.verifier !== expected) return;
        await native.deleteItemAsync(key, options);
      }),
  };
}
