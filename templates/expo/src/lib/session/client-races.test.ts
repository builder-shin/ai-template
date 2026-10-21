import { createApiClient } from "../api/client";
import { readPublicEnv } from "../config/env";
import { SessionManager } from "./manager";
import { memoryStore, passwordGrant, tokens, deferred } from "./test-fixtures";
import { nodeApiFetch } from "../testing/api-fetch";

describe("request cancellation and generation fences", () => {
  afterEach(() => jest.restoreAllMocks());
  function setup() {
    const manager = new SessionManager({
      store: memoryStore(),
      transport: {
        grant: jest.fn().mockResolvedValue(tokens("a")),
        revoke: jest.fn(async () => {}),
      },
    });
    return {
      manager,
      client: createApiClient(readPublicEnv({}, "ios", false), manager, undefined, nodeApiFetch),
    };
  }
  test("a request begun anonymous cannot publish after signing in", async () => {
    const { manager, client } = setup();
    const held = deferred<Response>();
    jest.spyOn(global, "fetch").mockReturnValue(held.promise);
    const request = client.GET("/posts");
    await manager.signIn(passwordGrant);
    held.resolve(new Response(JSON.stringify({ data: [] })));
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
  test("logout aborts the old HTTP signal even when transport ignores cancellation", async () => {
    const { manager, client } = setup();
    await manager.signIn(passwordGrant);
    const held = deferred<Response>();
    let captured: Request | undefined;
    jest.spyOn(global, "fetch").mockImplementation((input) => {
      captured = input as Request;
      return held.promise;
    });
    const request = client.GET("/posts");
    await manager.signOut();
    held.resolve(new Response(JSON.stringify({ data: [] })));
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(captured?.signal.aborted).toBe(true);
  });
  test("late JSON body consumption cannot return data for an old generation", async () => {
    const { manager, client } = setup();
    await manager.signIn(passwordGrant);
    const entered = deferred<void>();
    const body = deferred<string>();
    const response = new Response("");
    response.text = () => {
      entered.resolve();
      return body.promise;
    };
    jest.spyOn(global, "fetch").mockResolvedValue(response);
    const request = client.GET("/posts");
    await entered.promise;
    await manager.signOut();
    body.resolve(JSON.stringify({ data: [] }));
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
});
