export async function register() {
  // 빌드에는 서버 비밀이 필요 없고, 이 템플릿의 운영 서버는 Node 런타임이다.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NEXT_PHASE === "phase-production-build") return;
    const { exitOnInvalidEnv } = await import("./lib/env/startup");
    exitOnInvalidEnv(process.env);
  }
}
