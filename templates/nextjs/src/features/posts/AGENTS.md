# 골든 글 기능

- `pnpm gen:feature <복수형 이름>`이 이 폴더와 공개·내 글 화면, HTTP 테스트를 복사한다.
- `index.ts`가 공개 인터페이스다. 읽기는 `queries.ts`, 쓰기는 `actions.ts`에 둔다.
- `gen:feature: 빼기`는 해당 줄, `빼기 시작`·`빼기 끝`은 구간을 복사하지 않는다.
- `gen:feature: 그대로`는 같은 줄의 이름을 바꾸지 않는다. `고칠 곳 — 설명`은 생성 결과의 검토 목록에 남는다.
- 계약 타입·API 경로·JSON:API type·에러 코드·실시간 채널은 생성기가 보존한다. 새 기능의 계약을 만든 뒤 표시한 곳을 고친다.
- 새 기능도 Server Component·Server Action, `server-only`, JS 없는 폼, ko/en 번역, 스피너·스켈레톤 규칙을 따른다. 업로드와 미리보기는 JS가 필요하다.
- 실제 목으로 조회·Action·커버를 확인한다. HTTP 테스트는 로케일별 화면과 JS 없는 폼을 확인한다.
