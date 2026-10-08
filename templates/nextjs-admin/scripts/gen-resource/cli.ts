import { generateResource } from "./generate";

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
  console.log(
    "사용법: pnpm gen:resource <type>\n계약의 목록 operation에서 선언·ko/en 문구·등록 초안을 만든다.",
  );
} else if (args.length !== 1 || args[0]?.startsWith("-")) {
  console.error("리소스 type이 필요하다 — 다음 꼴로 실행한다: pnpm gen:resource <type>");
  process.exitCode = 2;
} else {
  try {
    const files = await generateResource(process.cwd(), args[0]!);
    console.log(
      `리소스 초안 생성: ${args[0]}\n${files.join("\n")}\n권한·열·필터·관계 대상·입력·ko/en 문구를 확인하고 pnpm check를 실행한다.`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "리소스 생성 실패";
    console.error(message.includes("—") ? message : `${message} — 계약과 출력 경로를 확인한다.`);
    process.exitCode = 1;
  }
}
