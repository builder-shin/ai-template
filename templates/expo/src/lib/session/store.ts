import * as SecureStore from "expo-secure-store";
import { z } from "zod";
import { SessionStorageError, type SessionStore, type StoredSession } from "./types";

const record = z
  .object({
    sessionId: z.string().min(1).max(200),
    refreshToken: z.string().min(1).max(8192),
    refreshTokenExpiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();
const key = "ai-template.refresh-session.v1";
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: key,
};
type NativeStore = Pick<typeof SecureStore, "getItemAsync" | "setItemAsync" | "deleteItemAsync">;

export function parseStoredSession(raw: string | null, now = Date.now()): StoredSession | null {
  if (!raw) return null;
  try {
    const value = record.safeParse(JSON.parse(raw) as unknown);
    return value.success && Date.parse(value.data.refreshTokenExpiresAt) > now ? value.data : null;
  } catch {
    return null;
  }
}
export function createSessionStore(native: NativeStore = SecureStore): SessionStore {
  return {
    async read() {
      try {
        const raw = await native.getItemAsync(key, options);
        const parsed = parseStoredSession(raw);
        if (raw && !parsed) await native.deleteItemAsync(key, options);
        return parsed;
      } catch {
        throw new SessionStorageError();
      }
    },
    async write(value) {
      const parsed = record.safeParse(value);
      if (!parsed.success || Date.parse(parsed.data.refreshTokenExpiresAt) <= Date.now())
        throw new SessionStorageError();
      try {
        await native.setItemAsync(key, JSON.stringify(parsed.data), options);
      } catch {
        throw new SessionStorageError();
      }
    },
    async clear() {
      try {
        await native.deleteItemAsync(key, options);
      } catch {
        throw new SessionStorageError();
      }
    },
  };
}
