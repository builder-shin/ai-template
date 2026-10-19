/** 외부 오류의 원문·원인·스택 대신 허용한 진단 분류만 반환한다. */
export function dependencyFailure(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  const code = "code" in error ? error.code : undefined;
  if (code === "ETIMEDOUT" || error.message === "Command timed out") return "timeout";
  if (error.name === "MaxRetriesPerRequestError" || error.message === "Connection is closed.")
    return "connection";
  if (
    typeof code === "string" &&
    [
      "ECONNREFUSED",
      "ECONNRESET",
      "ENOTFOUND",
      "EHOSTUNREACH",
      "ENETUNREACH",
      "ECONNABORTED",
    ].includes(code)
  )
    return "connection";
  if (error.name === "ReplyError") {
    if (error.message.startsWith("WRONGTYPE ")) return "redis_wrong_type";
    if (error.message.startsWith("NOSCRIPT ")) return "redis_script_missing";
    return "redis_reply";
  }
  return "unknown";
}
