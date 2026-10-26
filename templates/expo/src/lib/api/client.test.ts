import { createApiClient } from "./client";
import { readPublicEnv } from "../config/env";
import { ApiError } from "./errors";
import { nodeApiFetch } from "../testing/api-fetch";

describe("confined JSON:API transport", () => {
  const config = readPublicEnv({}, "ios", false);
  afterEach(() => jest.restoreAllMocks());

  test("uses the configured base and JSON:API headers", async () => {
    const fetcher = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        headers: { "Content-Type": "application/vnd.api+json" },
      }),
    );
    const client = createApiClient(config, undefined, undefined, nodeApiFetch);
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
    const client = createApiClient(config, undefined, undefined, nodeApiFetch);
    await expect(client.GET("/posts", { baseUrl: "https://attacker.example" })).rejects.toThrow(
      /origin|base/i,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("fully encodes query names while preserving JSON:API includes and literal filter values", async () => {
    const fetcher = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        headers: { "Content-Type": "application/vnd.api+json" },
      }),
    );
    const query = "서울 A+B%2C&include=forged";
    await createApiClient(config, undefined, undefined, nodeApiFetch).GET("/posts", {
      params: {
        query: {
          "page[number]": 1,
          "page[size]": 20,
          include: "author,coverImage",
          "fields[posts]": "title,body",
          "filter[q]": query,
        },
      },
    });
    const request = fetcher.mock.calls[0]![0] as Request;
    expect(request.url).not.toMatch(/[\[\] ]/);
    expect(request.url).toContain("page%5Bnumber%5D=1");
    const params = new URL(request.url).searchParams;
    expect(params.getAll("include")).toEqual(["author,coverImage"]);
    expect(params.get("page[number]")).toBe("1");
    expect(params.get("fields[posts]")).toBe("title,body");
    expect(params.get("filter[q]")).toBe(query);
    expect([...params]).toHaveLength(5);
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
      await createApiClient(config, undefined, undefined, nodeApiFetch).GET("/posts");
      throw new Error("Expected failure.");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).fieldErrors()).toEqual({ title: "validation.invalid_format" });
    }
  });
});
