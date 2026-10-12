import type { Socket } from "socket.io";
import type { Principal } from "../security/principal.js";
export interface ConnectionData {
  principal?: Principal;
}
export type RealtimeSocket = Socket<
  Record<string, never>,
  Record<string, (...args: unknown[]) => void>,
  Record<string, never>,
  ConnectionData
>;
