import type { MobileEnv } from "../config/env";
import { createApiClient } from "../api/client";
import { ApiError } from "../api/errors";
import type { SessionTransport } from "./types";

export function createSessionTransport(
  config: MobileEnv,
  locale: () => "ko" | "en",
): SessionTransport {
  const bare = createApiClient(config);
  return {
    async grant(input, signal) {
      const result = await bare.POST("/sessions", {
        body: { data: { type: "sessions", attributes: input } },
        headers: { "Accept-Language": locale() },
        signal,
      });
      if (!result.data) throw new ApiError(502);
      const { id, attributes } = result.data.data;
      if (
        !id ||
        !attributes.accessToken ||
        !attributes.refreshToken ||
        !Number.isFinite(Date.parse(attributes.refreshTokenExpiresAt)) ||
        Date.parse(attributes.refreshTokenExpiresAt) <= Date.now()
      )
        throw new ApiError(502);
      return result.data;
    },
    async revoke(sessionId, accessToken) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        // Explicit captured token: local generation is already invalidated, so use a bare confined request.
        const response = await fetch(
          `${config.apiBaseUrl}/sessions/${encodeURIComponent(sessionId)}`,
          {
            credentials: "omit",
            redirect: "error",
            cache: "no-store",
            method: "DELETE",
            headers: {
              Accept: "application/vnd.api+json",
              "Accept-Language": locale(),
              Authorization: `Bearer ${accessToken}`,
            },
            signal: controller.signal,
          },
        );
        if (!response.ok && response.status !== 401 && response.status !== 404)
          throw await ApiError.fromResponse(response);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
