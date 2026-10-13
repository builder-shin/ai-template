import { expect, it } from "vitest";
import { retryDelay } from "../backoff.js";
it.each([
  [1, 0, 5000],
  [1, 0.9999, 6000],
  [4, 0, 20000],
  [20, 0, 60000],
])("재시도 %i회의 난수 %f 지연은 %i밀리초다", (attempt, random, expected) => {
  expect(retryDelay(attempt, () => random)).toBe(expected);
});
