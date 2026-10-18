# NestJS R2 설치 경계 격리 보충 판정

2026-10-18 R124는 기존 NestJS 설계 §10.4의 API 공유 설치 정책을 이 문서의 독립 설치 경계로 바꾼다. 원래 설계와 계획 문서는 당시 승인 기록으로 보존한다.

실제 PR CI 39129250330은 단독 web과 조합의 숨은 hoist 버전 차이 16개를 검출했다. 원본 잠금과 pnpm 12.6.0의 importer 우선순위는 apps/api의 socket.io 4.8.3이 contract/mock의 4.8.4보다 먼저 선택되는 원인을 설명한다. 나머지 차이의 전체 선택 경로는 로컬 설치로 재현하지 않았으며 실제 CI가 계속 판정한다.

프론트와 계약은 기존 루트 workspace·잠금을 유지한다. 실제 apps/api는 원본 pnpm-lock.yaml과 pnpm-workspace.yaml을 그대로 보관한 별도 설치 루트다. 루트 workspace의 tools/api는 외부 의존성이 없는 api 작업 패키지로, 기존 filter api·Turbo 스크립트와 인자를 실제 apps/api에 전달한다. API 작업은 실제 API 소스·설정·스키마·잠금을 입력으로 선언하고 캐시하지 않는다. 루트 Git hook 소유권과 프론트 gen의 api#gen 선행 조건을 유지한다.

생성은 프론트 원본 해석을 엄격히 검증하고 루트 frozen 설치와 실제 API frozen 설치를 수행한 뒤 web·admin gen을 실행한다. 이후 API 의존성 add/remove/exec는 pnpm --dir apps/api로 실행한다. 갱신 뒤 두 설치 경계의 frozen 설치, 루트 pnpm check와 web·admin 빌드로 호환성을 확인한다. R1은 실제 API nodemailer remove/add와 프론트 importer 변화 보고서를 남기며 변화 보고서가 비어야 한다는 조건은 없다.

기본 hoist와 원본 버전·계약·FastAPI 출력은 유지한다. R2는 같은 HEAD의 단독 web이 가진 모든 숨은 이름과 버전을 계속 비교하고 실제 apiOnly 목록을 보관한다. API 이미지는 루트 문맥에서 API 자체 잠금으로 설치하며 운영 의존성만 포함한다. 사용자 10001, Next 해석 실패, 실제 health와 이미지 크기 검증도 유지한다.

대가는 내부 작업 패키지 하나와 독립 frozen 설치 한 번이다. 이 분리는 API 의존성이 프론트 숨은 hoist 버전을 선택하는 경로를 제거하며, proxy 자체를 API 패키지 관리자 별칭으로 오해하지 않아야 한다. hermetic 생성·전달·캐시·Docker·호출자 시험과 변경하지 않은 FastAPI 바이트 골든을 로컬에서 확인한다. 실제 설치·전체 widgets fast check·E2E·이미지·R1·R2는 새 정확한 HEAD의 PR와 main 전체 CI가 검증한다.
