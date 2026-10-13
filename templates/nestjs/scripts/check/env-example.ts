/** 환경 예시의 키 집합을 설정 스키마와 비교한다. 값은 읽거나 출력하지 않는다. */
export function envExampleProblems(exampleText: string, settingKeys: readonly string[]): string[] {
  const required = new Set(settingKeys);
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const [index, line] of exampleText.split(/\r?\n/).entries()) {
    const key = /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1];
    if (key === undefined) continue;
    if (!required.has(key))
      problems.push(`.env.example:${String(index + 1)} ${key} — 설정 스키마에 없는 키다`);
    if (seen.has(key)) problems.push(`.env.example:${String(index + 1)} ${key} — 키가 중복이다`);
    seen.add(key);
  }
  for (const key of settingKeys)
    if (!seen.has(key)) problems.push(`.env.example — 설정 키 ${key}가 없다`);
  return problems;
}
