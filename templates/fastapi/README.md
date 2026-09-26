# FastAPI 템플릿

JSON:API 규약을 따르는 FastAPI 백엔드 템플릿이다. AI 에이전트와 함께 개발하도록 규칙을 기계가 검사한다.

## 시작하기

[uv](https://docs.astral.sh/uv/) 0.12 이상과 Docker가 필요하다.

```bash
uv run poe setup
```

`uv run`이 Python 3.14와 의존성을 먼저 맞추고, `setup`이 개발 인프라(compose), DB, 버킷을 준비한다. 명령과 규칙은 [AGENTS.md](AGENTS.md)에 있다.
