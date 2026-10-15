---
name: nestjs-backend
description: NestJS 모듈·엔드포인트·마이그레이션·잡·권한·메일·실시간 변경을 프로젝트 레시피로 수행한다.
---

# NestJS 백엔드 변경

먼저 프로젝트 `AGENTS.md`를 읽고 적용할 변경의 `docs/recipes/` 문서를 읽는다.
새 리소스는 `module.md`에 따라 계약부터 확장하고 `pnpm gen:module <복수형>`을 실행한다.
엔드포인트는 `endpoint.md`, DB는 `migration.md`, 잡은 `job.md`와 `jobs.md`,
권한은 `permission.md`, 메일은 `mail-template.md`, 이벤트는 `realtime-event.md`를 따른다.

행동 시험으로 실패를 확인한 뒤 구현하고 `pnpm gen`과 `pnpm check --fast`를 실행한다.
완료 기준은 준비된 환경의 전체 `pnpm check`다. 비밀 파일·생성물·커밋된 마이그레이션을
직접 고치지 않고 git hook을 유지한다. 인프라가 없는 환경에서 실제 연결 시험을 대신
통과한 것으로 보고하지 않는다.
