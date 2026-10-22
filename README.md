# ai-template

API 계약과 AI 작업 하네스를 함께 제공하는 독립 프로젝트 템플릿이다.

| 템플릿         | 용도                                   |
| -------------- | -------------------------------------- |
| `fastapi`      | Python API·worker·scheduler            |
| `nestjs`       | TypeScript API·worker·scheduler        |
| `nextjs`       | 사용자용 Next.js BFF                   |
| `nextjs-admin` | 관리용 Next.js BFF                     |
| `expo`         | iOS·Android 네이티브 앱, API 직접 연결 |

Node 24와 pnpm 12.6.0을 사용한다. [생성 CLI](create/README.md)와 각 앱의 AGENTS.md에서 설치·검증 절차를 확인한다. 생성 대상은 저장소 밖의 새 폴더 또는 빈 폴더다.

```sh
pnpm new ../my-mobile --template expo
pnpm new ../my-product --api fastapi --mobile
pnpm new ../my-platform --api nestjs --web --admin --mobile
```

Expo는 비밀번호·Google/Kakao/Naver PKCE 인증, SecureStore 세션, posts CRUD, 프로필·이미지, foreground 실시간 연결, ko/en을 포함한다. 모바일 의존성은 독립 workspace에 설치하며 조합에서는 루트 계약 하나를 재사용한다. `export`는 Metro 번들이고 `build`·`test:e2e`는 실제 네이티브 도구와 기기가 필요하다. Expo Web·EAS 계정·스토어 출시는 포함하지 않는다.

저장소 완료 기준은 `pnpm check`다. 각 독립 템플릿의 전체 검사와 네이티브·백엔드 E2E는 해당 CI에서도 검증한다. 보호 규칙과 명령 지도는 [AGENTS.md](AGENTS.md), 공통 기준은 [하네스 표준](docs/harness/standard.md)에 있다.
