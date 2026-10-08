# 필드 종류 추가

먼저 `src/lib/resources/definition.ts`와 `src/components/resource/types.ts`를 읽는다. 기존 text·textarea·date·enum·boolean·relation·relation-many·file로 표현되는지 확인한다. 필터는 text·enum·relation·date, 입력은 text·textarea·enum·boolean·relation·relation-many다.

1. 리소스 하나만 필요한 표시는 그 폴더의 컴포넌트를 최상위 `fields.<name>.display`에 둔다. 입력은 `input`에 둔다. `DisplayProps`는 name·value·record·included·locale·timeZone, `InputProps`는 name·label·kind·defaultValue·options·search를 받는다.
2. 입력은 같은 name으로 제출하고 `useResourceField(name)`으로 오류·접근성 속성을 읽는다. 비운 관계·체크박스는 `__present_<name>`을 제출한다. Server Action과 `useActionState`를 유지한다. 일반 컴포넌트 함수를 클라이언트 props로 넘기지 않는다.
3. 공통 종류가 필요하면 definition의 DisplayKind·InputKind·FilterKind와 화면 types를 함께 늘린다. display.tsx·form.tsx·filters.tsx·screen.tsx의 실제 소비자를 맞춘다. 모든 종류를 세 위치에 무조건 추가하지 않는다.
4. 쓰기 종류는 `src/lib/resources/values.ts`의 FormData 해석과 data.ts의 JSON:API attributes·relationships 분류도 맞춘다. 이름만 추가하면 문서가 달라지므로 실제 목의 요청·응답과 source.pointer를 검사한다.
5. `scripts/gen-resource/draft.ts`의 스키마 추론을 검토하고 계약 조각 테스트를 더한다. 자동 추론이 불가능한 종류는 레시피에 수동 선언 절차를 적는다. 문구·enum values는 ko/en 양쪽에 둔다.
6. 날짜는 TIME_ZONE, enum은 번역한 배지, 관계는 included의 이름·id 대체를 유지한다. DOM에서 값·오류·비운 값·접근성을 확인한다. UI 부품은 고정 `pnpm exec shadcn add <부품>`을 쓴다.
7. `pnpm check`, `pnpm build`, `pnpm test:e2e`를 차례로 통과시키고 시작한 서버를 종료한다. 로딩은 스피너·스켈레톤만 쓴다.
