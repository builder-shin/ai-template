export async function register() {
  // 빌드에는 서버 비밀이 필요 없고, 이 템플릿의 운영 서버는 Node 런타임이다.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NEXT_PHASE === "phase-production-build") return;
    const { parseEnv } = await import("./lib/env");
    const { writeSync } = await import("node:fs");
    try {
      parseEnv(process.env);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      // standalone은 next.config의 서버 phase를 다시 실행하지 않는다.
      writeSync(2, `${error.message}\n`);
      process.exit(1);
    }
  }
}
