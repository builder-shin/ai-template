# 운영 이미지. 명령만 바꿔 api(기본), worker, scheduler, migrate로 띄운다(compose.yaml의 app 프로필).
# 빌드 단계는 uv로 운영 의존성과 앱을 가상환경에 설치하고, 실행 단계는 그 가상환경만 가져간다.
FROM ghcr.io/astral-sh/uv:0.12.19 AS uv

FROM python:3.14.7-slim-trixie AS build
COPY --from=uv /uv /usr/local/bin/uv
# 바이트코드를 미리 만들고, 캐시에서 링크하지 않고 복사하며, 이미지의 Python만 쓴다.
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never
WORKDIR /app
# 의존성을 먼저 설치해, 코드만 바뀌었을 때는 이 층을 다시 쓴다.
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-install-project
COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-editable

FROM python:3.14.7-slim-trixie
RUN useradd --system --create-home --uid 10001 app
WORKDIR /app
COPY --from=build /app/.venv /app/.venv
# migrate 명령(alembic upgrade head)이 읽는 설정과 마이그레이션
COPY pyproject.toml ./
COPY migrations ./migrations
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1
USER app
EXPOSE 8000
# HEALTHCHECK는 두지 않는다. 같은 이미지가 worker, scheduler, migrate로도 뜨는데 헬스체크는 api에만
# 맞기 때문이다. api의 헬스체크는 compose.yaml의 api 서비스와 배포 환경의 probe(/health/live,
# /health/ready)에 둔다.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
