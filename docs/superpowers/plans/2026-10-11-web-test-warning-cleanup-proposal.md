# web 테스트 경고 정리 제안

- 작성일: 2026-10-11
- 상태: 사용자 계획 검토 전 제안. A3 프로토타입의 구현 범위와 별도이며 아직 실행하지 않았다.
- 근거: [admin 설계 §16](../specs/2026-10-08-nextjs-admin-design.md#16-a3-구현-기록-2026-10-11-프로토타입)의 기존 경고 비교와 기존 전체 web Vitest 104파일·905개 통과 기록이다. 별도 프로세스 회귀 추가 뒤 전체 검사는 104파일·916개이며 경고 기준선은 같다.

## 기준선

web의 stderr 블록은 17개다. 블록 안 진단은 React act 17건·Base UI uncontrolled FieldControl/defaultValue 2건·nativeButton 1건이며 한 블록에 둘 이상 있어 합산하지 않는다. admin Vitest 경고는 0이다. 패키지의 peer 선언 경고와 Next의 스트림 취소 진단은 이 기준선과 별도다.

| web 테스트 파일                                | stderr 블록 |
| ---------------------------------------------- | ----------: |
| src/components/layout.test.tsx                 |           2 |
| src/features/auth/login-form.test.tsx          |           1 |
| src/features/auth/password-reset-form.test.tsx |           2 |
| src/features/auth/signup-form.test.tsx         |           3 |
| src/features/files/profile-upload.test.tsx     |           2 |
| src/features/files/upload.test.tsx             |           2 |
| src/features/me/deletion-form.test.tsx         |           1 |
| src/features/me/forms.test.tsx                 |           2 |
| src/features/posts/editor.test.tsx             |           1 |
| src/features/sessions/components.test.tsx      |           1 |
| 합계                                           |          17 |

A3는 파일·메시지·발생 횟수가 이 기준선과 같은 경우만 기존 예외로 받아들였다. 제목 정리는 명시한 제목 변경과 기록한 경로·stack 이동만 정규화한다. 진단을 지우거나 필터링해 경고 0으로 표현하지 않는다.

## 별도 계획의 범위

1. 파일별 최소 실행에서 실제 비동기 업데이트와 assertion의 완료 시점을 확인한다. React act 진단은 테스트 환경과 업데이트 경계를 조사하고 관측한 원인에만 수정·회귀를 붙인다. sleep·timeout 증가나 일괄 재시도로 통과시키지 않는다.
2. 두 FieldControl 진단은 defaultValue의 null과 초기화 계약을 확인한다. 등록·재설정 입력값·필드 오류·입력 보존·JS 없는 제출이 같은지 검증한다. 제품 변경이 필요하면 그 근거와 범위를 따로 검토한다.
3. layout의 nativeButton 진단은 Base UI render 대상과 nativeButton 설정을 확인한다. 메뉴의 역할·키보드·포커스·로그아웃 동작을 유지한다.
4. console 대체, stderr 숨김, Vitest silent 설정, 경고 허용 목록·peer override로 진단을 없애지 않는다. 공유 원본을 바꾸면 sync 후 두 프론트를 검사한다. 불필요한 의존성 갱신은 하지 않는다.

## 수용 기준과 검토할 결정

사용자가 별도 계획의 범위와 구현 순서를 승인한 뒤 진행한다. 전체 verbose Vitest에서 기존 17블록과 그 진단이 실제로 사라지고 새 경고가 0인지 확인한다. 부분 테스트 통과만으로 완료하지 않는다. web의 uncached check 9단계 → build → 목 E2E 20개를 직렬로 확인하며, 공유 변경이 있으면 admin의 10단계 → build → 목 E2E 18개와 경고 0도 확인한다. Docker·FastAPI 회귀와 이미지 확인은 전체 PR CI가 맡는다.

실제 최소 재현에서 테스트 동기화와 제품 입력 계약 중 어느 쪽 수정이 필요한지 결정한다. A3의 공유 IP 예산(Q1), 단일 프론트 CI(Q2), 역할 설명(Q3) 잠정 선택은 이 경고 정리와 함께 묶어 승인된 것으로 보지 않는다.
