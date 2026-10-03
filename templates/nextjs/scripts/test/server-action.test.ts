import { expect, it } from "vitest";
import type { Page, Response } from "@playwright/test";
import { waitForServerAction } from "../../e2e/fixtures";

it("일반 POST·GET·업로드 응답을 건너뛰고 Server Action POST 응답을 돌려준다", async () => {
  const responses = [
    ["POST", {}],
    ["GET", { "next-action": "action-id" }],
    ["PUT", { "next-action": "action-id" }],
    ["POST", { "next-action": "action-id" }],
  ].map(
    ([method, headers]) =>
      ({ request: () => ({ method: () => method, headers: () => headers }) }) as Response,
  );
  const page = {
    waitForResponse: async (predicate: (response: Response) => boolean | Promise<boolean>) => {
      for (const response of responses) if (await predicate(response)) return response;
      throw new Error("Server Action 응답을 찾지 못했다");
    },
  } as Page;
  expect(await waitForServerAction(page)).toBe(responses[3]);
});
