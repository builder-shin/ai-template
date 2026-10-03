import { parseArguments, usage } from "./arguments.ts";
import { createProject } from "./create.ts";
import { CreateError, errorReason } from "./errors.ts";
import { findRepository } from "./repository.ts";

let interrupted = false;
const isInterrupted = (): boolean => interrupted;
const recordInterruption = () => {
  interrupted = true;
};
process.on("SIGINT", recordInterruption);
process.on("SIGTERM", recordInterruption);

try {
  const options = parseArguments(process.argv.slice(2));
  if (options === "help") {
    console.log(usage);
  } else {
    const result = createProject(options, findRepository(import.meta.url), {
      interrupted: isInterrupted,
    });
    console.log(`생성 완료: ${result.target}`);
    if (options.git && !result.committed) {
      console.log(
        `git 사용자 정보가 없다 — git config user.name과 git config user.email을 설정한 뒤 git commit -m "${result.commitMessage}"를 실행한다.`,
      );
    }
    console.log(`다음 명령: cd "${result.target}"`);
    console.log(options.template === "fastapi" ? "uv run poe setup" : "pnpm setup");
  }
} catch (error) {
  const failure =
    error instanceof CreateError
      ? error
      : new CreateError(
          `프로젝트 생성에 실패했다(${errorReason(error)})`,
          "템플릿 파일 형식과 대상 폴더의 쓰기 권한을 확인한다.",
        );
  console.error(failure.message);
  process.exitCode = isInterrupted() ? 130 : failure.exitCode;
} finally {
  process.off("SIGINT", recordInterruption);
  process.off("SIGTERM", recordInterruption);
}
