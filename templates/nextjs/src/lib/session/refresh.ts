import "server-only";
import { createApiClient } from "../api/client";
import { getEnv } from "../env";
import type { routing } from "../i18n/routing";
import { sessionFromTokens, type Session } from "./cookie";

type Flight = { result: Promise<Session>; expiresAt: number };
const flights = new Map<string, Flight>();
const memoMs = 30000;

/** proxy만 호출한다. 실패도 기억해 불확실한 토큰을 즉시 다시 보내지 않는다. */
export function refreshSession(refreshToken: string, locale: (typeof routing.locales)[number]) {
  const previous = flights.get(refreshToken);
  if (previous && Date.now() < previous.expiresAt) return previous.result;

  const client = createApiClient({ baseUrl: getEnv().API_BASE_URL, locale });
  const flight: Flight = {
    expiresAt: Infinity,
    result: client
      .POST("/sessions", {
        body: {
          data: { type: "sessions", attributes: { grantType: "refreshToken", refreshToken } },
        },
      })
      .then(({ data }) => {
        if (!data) throw new Error("갱신 응답에 세션이 없다.");
        return sessionFromTokens(data.data.attributes, data.data.id);
      }),
  };
  flights.set(refreshToken, flight);
  const settled = () => {
    flight.expiresAt = Date.now() + memoMs;
    // 요청이 더 없어도 토큰을 메모리에서 치운다. 프로세스 종료를 막지 않는다.
    setTimeout(() => {
      if (flights.get(refreshToken) === flight) flights.delete(refreshToken);
    }, memoMs).unref();
  };
  void flight.result.then(settled, settled);
  return flight.result;
}
