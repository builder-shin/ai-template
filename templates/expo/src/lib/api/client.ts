import createClient from "openapi-fetch";
import type { paths } from "./generated/schema";
import type { MobileEnv } from "../config/env";
import type { SessionPort } from "./session-port";
import { ApiError } from "./errors";
import { bindSession } from "./session-client";

export function createApiClient(
  config: MobileEnv,
  session?: SessionPort,
  locale: () => "ko" | "en" = () => "ko",
) {
  const base = new URL(config.apiBaseUrl);
  const client = createClient<paths, "application/vnd.api+json">({
    baseUrl: config.apiBaseUrl,
    querySerializer: {
      array: { style: "form", explode: false },
      object: { style: "deepObject", explode: true },
    },
    bodySerializer: JSON.stringify,
    fetch: async (input) => {
      const request = new Request(input as Request, {
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
      });
      const url = new URL(request.url);
      if (url.origin !== base.origin || !url.pathname.startsWith(`${base.pathname}/`))
        throw new Error("API base origin/path override refused.");
      request.headers.set("Accept", "application/vnd.api+json");
      request.headers.set("Content-Type", "application/vnd.api+json");
      if (!["ko", "en"].includes(request.headers.get("Accept-Language") ?? ""))
        request.headers.set("Accept-Language", locale());
      for (const name of ["Forwarded", "X-Forwarded-For", "X-Real-IP", "Authorization", "Cookie"])
        request.headers.delete(name);
      const credentials = session?.credentials();
      if (credentials) request.headers.set("Authorization", `Bearer ${credentials.accessToken}`);
      const retry = request.clone();
      let response = await fetch(request);
      if (response.status === 401 && credentials && session) {
        const next = await session.refresh(credentials);
        if (next) {
          retry.headers.set("Authorization", `Bearer ${next.accessToken}`);
          response = await fetch(retry);
        }
      }
      if (credentials && session?.credentials()?.generation !== credentials.generation)
        throw new DOMException("Session changed.", "AbortError");
      if (!response.ok) throw await ApiError.fromResponse(response);
      return response;
    },
  });
  return session ? bindSession(client, session) : client;
}
