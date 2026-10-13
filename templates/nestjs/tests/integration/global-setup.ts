import { assertProjectDatabase } from "../../scripts/db/guard.js";
import { closeState, getState } from "./state.js";
export default async function globalSetup(): Promise<() => Promise<void>> {
  try {
    const { settings, prisma, redis, mailpitUrl } = getState();
    await assertProjectDatabase(settings.DATABASE_URL);
    await prisma.$queryRaw`SELECT 1`;
    await redis.command.ping();
    for (const url of [`${settings.S3_ENDPOINT_URL}/healthz`, `${mailpitUrl}/api/v1/messages`]) {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error("인프라 응답 실패");
    }
    return closeState;
  } catch {
    await closeState();
    throw new Error("인프라에 연결하지 못했다 — pnpm setup을 실행한다");
  }
}
