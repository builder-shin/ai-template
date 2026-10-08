import { inject } from "vitest";
import { createApiClient } from "../../src/lib/api/client";

export function mockClient(accessToken?: string) {
  return createApiClient({
    baseUrl: `${inject("mockBaseUrl")}/api/v1`,
    locale: "ko",
    ...(accessToken ? { accessToken } : {}),
    log: () => {},
  });
}

export async function login() {
  const { data } = await mockClient().POST("/sessions", {
    body: {
      data: {
        type: "sessions",
        attributes: {
          grantType: "password",
          email: "admin@example.com",
          password: "admin-password", // betterleaks:allow 테스트 시드
        },
      },
    },
  });
  if (!data) throw new Error("테스트 세션이 없다.");
  return data.data.attributes;
}
