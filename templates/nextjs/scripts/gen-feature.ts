import { generateFeature } from "./gen-feature/generate";
import { GenerateError } from "./gen-feature/names";

const [name, ...args] = process.argv.slice(2);
try {
  if (!name || (args.length > 0 && (args.length !== 2 || args[0] !== "--singular")))
    throw new GenerateError(
      "pnpm gen:feature <복수형 이름> [--singular <끝 단어의 단수형>]으로 실행한다.",
    );
  const result = await generateFeature(process.cwd(), name, args[1]);
  console.log(
    `만들었다: ${result.names.kebab} (${result.names.pascal}), 단수형 ${result.names.one} (${result.names.pascalOne})`,
  );
  console.log(result.paths.map((path) => `- ${path}`).join("\n"));
  console.log("\n골든 기능이 표시한 고칠 곳:");
  console.log(result.review.map((item) => `- ${item}`).join("\n"));
  console.log(`
다음을 새 기능에 맞게 고친다.
- queries.ts·actions.ts·실제 목 테스트: 계약의 posts API·타입·에러 코드를 쓴다. TypeSpec과 목을 확장하고 pnpm gen한 뒤 바꾼다.
- model.ts·편집기·화면: 속성·관계·상태·권한·업로드를 맞춘다.
- realtime.tsx·테스트: 계약의 posts 채널·post.* 이벤트를 쓴다. 새 계약을 만든 뒤 바꾼다.
- messages/ko.json·en.json: 새 namespace ${result.names.camel}의 문구를 고친다.
- 헤더·홈: 새 화면 /${name}·/my-${name}의 진입 링크를 더한다.
- 끝나면 pnpm check, pnpm build, pnpm test:e2e로 확인한다.`);
} catch (error) {
  if (!(error instanceof GenerateError)) throw error;
  console.error(`gen:feature: ${error.message}`);
  process.exitCode = 1;
}
