import { createContext, useContext, useSyncExternalStore, type PropsWithChildren } from "react";
import type { createApiClient } from "../api/client";
import type { MobileEnv } from "../config/env";
import type { SessionManager } from "./manager";
import type { OAuthController } from "../links/oauth";

export interface SessionContextValue {
  manager: SessionManager;
  api: ReturnType<typeof createApiClient>;
  config: MobileEnv;
  oauth: OAuthController;
}
const Context = createContext<SessionContextValue | null>(null);
export function SessionProvider({
  children,
  value,
}: PropsWithChildren<{ value: SessionContextValue }>) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useSession() {
  const value = useContext(Context);
  if (!value) throw new Error("Wrap the application in SessionProvider.");
  const state = useSyncExternalStore(
    value.manager.subscribe,
    value.manager.snapshot,
    value.manager.snapshot,
  );
  return { ...value, state };
}
