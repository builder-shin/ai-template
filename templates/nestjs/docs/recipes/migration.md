# 마이그레이션

계약과 스키마 변경은 모델을 고친 뒤 고정 Prisma CLI로 생성한다.
`pnpm gen`은 생성 클라이언트를 만들고 `src/generated/**`는 추적하지 않는다.
`pnpm check`는 lint·typecheck 앞에서 이 생성을 실행한다.

raw Prisma CLI는 .env를 자동으로 읽지 않는다. prisma.config.ts가 받을 DATABASE_URL을
실행 프로세스 환경에 명시적으로 전달한다. 연결 정보를 채팅·로그에 출력하지 않는다.
로컬 DB 없이 첫 SQL은 이 환경을 준비한 뒤 아래 명령으로 만든다.

```sh
pnpm exec prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script --output prisma/migrations/<UTC yyyyMMddHHmmss>_<이름>/migration.sql
```

후속 마이그레이션은 직전 HEAD의 schema.prisma를 임시 before.prisma로 저장하고
`--from-empty` 대신 `--from-schema <임시>/before.prisma`를 사용한다.
SQL을 검토하고 새 일반 커밋으로 남긴다. 커밋한 마이그레이션은 수정·삭제하지 않는다.
`npx`·`pnpm dlx`로 Prisma를 실행하지 않는다. `prisma db push`, `--accept-data-loss`와
raw `prisma migrate reset`도 사용하지 않는다. reset은 소유·로컬 검사가 있는 명령만 쓴다.

준비된 개발 환경에서는 `pnpm db:revision <이름>`으로 shadow DB를 쓰는 create-only 초안을 만든다.
`pnpm db:migrate`는 소유 검사 뒤 deploy하며 `pnpm db:reset`은 로컬 DB만 지운다.
비어 있지 않은 DB에 _prisma_migrations가 없거나 다른 도구의 표가 있으면 표 이름과 함께 거절한다.
실제 적용과 drift·통합 검증은 준비된 CI 환경에서 수행한다.
