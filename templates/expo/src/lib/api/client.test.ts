import { createApiClient } from "./client";
import { readPublicEnv } from "../config/env";
import { ApiError } from "./errors";

describe("confined JSON:API transport", () => {
  const config = readPublicEnv({}, "ios", false);
  afterEach(() => jest.restoreAllMocks());

  test("uses the configured base and JSON:API headers", async () => {
    const fetcher = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        headers: { "Content-Type": "application/vnd.api+json" },
      }),
    );
    const client = createApiClient(config);
    await client.GET("/posts", {
      headers: {
        "Accept-Language": "en",
        Forwarded: "for=spoof",
        "X-Forwarded-For": "spoof",
        "X-Real-IP": "spoof",
      },
    });
    const request = fetcher.mock.calls[0]![0] as Request;
    expect(request.url).toBe(`${config.apiBaseUrl}/posts`);
    expect(request.headers.get("Accept")).toBe("application/vnd.api+json");
    expect(request.headers.get("Accept-Language")).toBe("en");
    for (const name of ["forwarded", "x-forwarded-for", "x-real-ip"])
      expect(request.headers.has(name)).toBe(false);
  });

  test("refuses an external base override before fetch", async () => {
    const fetcher = jest.spyOn(global, "fetch");
    const client = createApiClient(config);
    await expect(client.GET("/posts", { baseUrl: "https://attacker.example" })).rejects.toThrow(
      /origin|base/i,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("exposes typed server field pointers without raw payloads", async () => {
    const fetcher = jest.spyOn(global, "fetch");
    fetcher.mockResolvedValue(
      new Response(
        JSON.stringify({
          errors: [
            { code: "validation.invalid_format", source: { pointer: "/data/attributes/title" } },
          ],
        }),
        { status: 422 },
      ),
    );
    try {
      await createApiClient(config).GET("/posts");
      throw new Error("Expected failure.");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).fieldErrors()).toEqual({ title: "validation.invalid_format" });
    }
  });
});
