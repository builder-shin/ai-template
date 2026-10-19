import "reflect-metadata";
import { expect, it, vi } from "vitest";
import { AppModule } from "../../../app.module.js";
import { TicketStore } from "../../realtime/tickets.js";
import { createApp } from "../create-app.js";
import { settings } from "./fixtures.js";

it("인자 없이 만든 앱은 인프라 없는 그래프다", async () => {
  const actualRegister = AppModule.register.bind(AppModule);
  const register = vi.spyOn(AppModule, "register").mockImplementation((...args) => {
    // 기본값이 회귀해도 실제 인프라를 시작하기 전에 실패한다.
    expect(args[3]).toBe(false);
    return actualRegister(...args);
  });
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    app = await createApp({ settings });
    const tickets = app.get(TicketStore);
    expect(() =>
      tickets.issue({ userId: "u", sessionId: "s", permissions: new Set<never>() }),
    ).toThrow("인프라가 없는 앱에서는 티켓을 발급할 수 없다");
  } finally {
    register.mockRestore();
    await app?.close();
  }
});
