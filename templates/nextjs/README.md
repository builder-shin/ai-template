# Next.js web 템플릿

Node 24와 pnpm 12.6.0을 설치한 뒤 이 폴더를 독립 프로젝트로 복사한다.

```sh
pnpm setup
pnpm dev
```

http://localhost:3000 에서 홈 화면을 연다. `setup`은 여러 번 실행해도 기존 환경 값을 보존한다.
현재는 앱과 하네스 뼈대다. 계약·목 연동, i18n, UI와 인증 흐름은 다음 단계에서 더한다.

```sh
pnpm check
pnpm fix
pnpm test
```

빌드는 예시 환경으로도 가능하다. 운영 서버 시작 전에 `SESSION_SECRET`을 32바이트 이상의 새 비밀로 설정한다. 예시 비밀로는 운영 서버를 시작할 수 없다.

- [작업 지침](AGENTS.md)
- [아키텍처](docs/architecture.md)
- [버전과 문서](docs/stack.md)
