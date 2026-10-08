/**
 * 구독할 수 있는 채널(계약의 x-realtime-channels). FastAPI는 모듈이 채널을 선언하고(posts의 CHANNELS)
 * 그 선언으로 계약을 만든다. 목은 거꾸로 계약에서 읽는다. 그래서 채널 이름과 권한이 계약과 어긋날 수
 * 없다. 룸 이름은 채널 이름이다. 시작할 때 한 번 읽는다.
 */

import { isPermissionCode, type PermissionCode } from "../../core/permissions.ts";
import { isRecord } from "../../json.ts";
import { contract } from "../../jsonapi/contract-schemas.ts";

export interface Channel {
  readonly name: string;
  /** 구독에 필요한 권한. 없으면 익명 연결도 구독한다. */
  readonly permission: PermissionCode | undefined;
}

function channelOf(declared: unknown): Channel {
  const entry: Readonly<Record<string, unknown>> = isRecord(declared) ? declared : {};
  const { name, permission } = entry;
  if (typeof name !== "string") {
    throw new Error(`계약의 x-realtime-channels 항목에 이름이 없다: ${JSON.stringify(declared)}`);
  }
  if (permission === null) return { name, permission: undefined };
  if (typeof permission === "string" && isPermissionCode(permission)) return { name, permission };
  throw new Error(`계약의 채널 ${name}이 모르는 권한을 요구한다: ${JSON.stringify(permission)}`);
}

function loadChannels(): ReadonlyMap<string, Channel> {
  const declared = contract["x-realtime-channels"];
  if (!Array.isArray(declared)) throw new Error("계약에 x-realtime-channels가 없다.");
  return new Map(declared.map(channelOf).map((channel) => [channel.name, channel]));
}

/** 채널 이름 → 채널. */
export const CHANNELS = loadChannels();
