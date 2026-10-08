/** 기존 값은 보존하고 예시에 새로 생긴 키만 더한다. 값은 출력하지 않는다. */
function entries(text) {
  const result = new Map();
  for (const line of text.split(/\r?\n/)) {
    const key = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1];
    if (key && !result.has(key)) result.set(key, line);
  }
  return result;
}

export function envKeys(text) {
  return [...entries(text).keys()];
}

export function mergeEnv(current, example) {
  if (current === undefined) return example;
  const present = entries(current);
  const missing = [...entries(example)].filter(([key]) => !present.has(key));
  if (!missing.length) return current;
  const newline = current.includes("\r\n") ? "\r\n" : "\n";
  const separator = current && !current.endsWith("\n") ? newline : "";
  return current + separator + missing.map(([, line]) => line).join(newline) + newline;
}
