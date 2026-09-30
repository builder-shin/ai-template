/**
 * 목 서버 진입점(`pnpm start`). 설정을 읽고, 메모리 상태와 앱을 만들고, 포트 하나에 띄운다.
 *
 * - 설정이 틀리면 변수마다 한 줄씩 알리고 멈춘다(종료 코드 1).
 * - serve가 돌려주는 node:http 서버(server)에 실시간(Socket.IO)을 붙인다. API와 같은 포트를 쓴다.
 */

import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { ConfigError, loadConfig, type MockConfig } from "./config.ts";
import { createState } from "./state.ts";

function loadConfigOrExit(): MockConfig {
  try {
    return loadConfig(process.env);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
}

const config = loadConfigOrExit();
const app = createApp(config, createState());

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  const testEndpoints = config.testEndpoints ? "켜짐" : "꺼짐";
  console.log(
    `목 서버가 떴다: http://localhost:${String(info.port)} (테스트 통로 ${testEndpoints}, 시드 관리자 ${config.seedAdmin.email})`,
  );
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `포트 ${String(config.port)}을 이미 다른 프로세스가 쓰고 있다. PORT로 바꾸거나 그 프로세스를 끝낸다.`,
    );
  } else {
    console.error("목 서버를 띄우지 못했다.", error);
  }
  process.exit(1);
});
