// @ts-check

/** @typedef {{ ruleId: string, message: string, location: readonly { pointer?: string | undefined }[] }} LintProblem */

/**
 * 위반마다 `파일#위치 [규칙] 메시지` 한 줄을 stderr에 찍고, 위반이 있으면 종료 코드를 1로 둔다.
 * @param {string} target
 * @param {readonly LintProblem[]} problems
 */
export function report(target, problems) {
  for (const problem of problems) {
    const pointer = problem.location[0]?.pointer ?? "";
    console.error(`${target}${pointer} [${problem.ruleId}] ${problem.message}`);
  }
  if (problems.length > 0) {
    console.error(`API 스타일 위반 ${String(problems.length)}건`);
    process.exitCode = 1;
  }
}
