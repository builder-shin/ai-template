/** JSON 값 도우미. */

/** JSON 객체(배열과 null이 아닌 객체)인가. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
