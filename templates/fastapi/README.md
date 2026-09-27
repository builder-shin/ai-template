# FastAPI 템플릿

JSON:API 규약을 따르는 FastAPI 백엔드 템플릿이다. AI 에이전트와 함께 개발하도록 규칙을 기계가 검사한다. 포맷, 린트, 타입(basedpyright strict), 아키텍처, 파일 크기, 억제 주석, 생성물, 계약 린트, 테스트가 `uv run poe check` 하나로 돈다.

## 필요한 것

- [uv](https://docs.astral.sh/uv/) 0.12 이상. Python 3.14와 의존성은 `uv run`이 맞춘다.
- Docker. 개발 인프라(compose)와 운영 이미지에 쓴다.

## 시작하기

```bash
uv run poe setup   # .env, 인프라, 버킷, DB, 마이그레이션, git hook, FastAPI skill을 준비한다
uv run poe dev     # api(http://127.0.0.1:8000), worker, scheduler를 함께 띄운다
uv run poe check   # 완료 기준. 모든 검사를 돈다
```

`setup`은 여러 번 돌려도 된다. 명령 전체와 규칙은 [AGENTS.md](AGENTS.md)에 있다.

## 로컬 포트

개발 인프라는 127.0.0.1에만 열고, 다른 로컬 스택과 겹치지 않도록 호스트 포트는 기본 포트에 20000을 더한 번호다.

| 서비스                   | 주소                                                         |
| ------------------------ | ------------------------------------------------------------ |
| api(`dev`)               | http://127.0.0.1:8000                                        |
| PostgreSQL               | 127.0.0.1:25432(계정 `app`, DB `app`, `app_test`, `app_e2e`) |
| Valkey                   | 127.0.0.1:26379                                              |
| SeaweedFS(S3)            | http://127.0.0.1:28333                                       |
| Mailpit                  | SMTP 127.0.0.1:21025, 웹 http://127.0.0.1:28025              |
| 모의 OAuth               | http://127.0.0.1:28080                                       |
| Grafana(`observability`) | http://127.0.0.1:23000                                       |

`docker compose --profile app up -d --build --wait`는 운영 이미지로 migrate, api(8000), worker, scheduler까지 띄운다.

## 문서

- [AGENTS.md](AGENTS.md): 명령, 구조, 규칙, 완료 기준
- [docs/architecture.md](docs/architecture.md): 계층과 모듈, 요청 흐름, 프로세스, JSON:API 공통 계층 쓰는 법
- [docs/stack.md](docs/stack.md): 쓰는 버전과 그 문서
- [docs/recipes/](docs/recipes/): 작업 절차
