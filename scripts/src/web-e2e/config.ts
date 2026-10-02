import { parse } from "yaml";
import { COMPOSE_FILE, type Plan, projectName, URLS } from "./plan.ts";

export function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("설정은 객체로 적는다.");
  }
  return value as Record<string, unknown>;
}

function equal(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${label}: 전용 설정을 쓴다.`);
}

/** 환경 파일과 외부 자원을 해석하기 전에 수기 compose의 안전 경계를 확인한다. */
export function validateCompose(text: string, plan: Plan): void {
  equal(plan.project, projectName(plan.runId), "프로젝트");
  equal(plan.composeFile, COMPOSE_FILE, "compose 파일");
  const document = record(parse(text, { merge: true }) as unknown);
  equal(Object.keys(document).sort(), ["services", "volumes", "x-app"], "compose 구조");
  const services = record(document.services);
  const infra = {
    postgres: "postgres:18.6-alpine",
    valkey: "valkey/valkey:9.1.2",
    seaweedfs: "chrislusf/seaweedfs:4.47",
    mailpit: "axllent/mailpit:v1.31.2",
    oauth: "ghcr.io/navikt/mock-oauth2-server:6.0.3",
  };
  const apps = ["migrate", "storage-init", "api", "worker", "scheduler"];
  equal(Object.keys(services).sort(), [...Object.keys(infra), ...apps].sort(), "서비스 목록");
  const volumes = record(document.volumes);
  equal(Object.keys(volumes).sort(), ["postgres-data", "seaweedfs-data"], "볼륨 목록");
  for (const value of Object.values(volumes)) {
    if (value !== null) equal(value, {}, "프로젝트 전용 볼륨");
  }
  const publications: Record<string, string[]> = {
    api: ["127.0.0.1:18100:8000"],
    seaweedfs: ["127.0.0.1:28433:8333"],
    mailpit: ["127.0.0.1:28125:8025"],
    oauth: ["127.0.0.1:28180:8080"],
  };
  const mounts: Record<string, string[]> = {
    postgres: ["postgres-data:/var/lib/postgresql"],
    seaweedfs: ["seaweedfs-data:/data"],
  };
  const allowed = new Set([
    "build",
    "image",
    "environment",
    "command",
    "ports",
    "volumes",
    "healthcheck",
    "depends_on",
  ]);
  for (const [name, value] of Object.entries(services)) {
    const service = record(value);
    for (const key of Object.keys(service)) {
      if (!allowed.has(key)) throw new Error(`${name}.${key}: 전용 스택에서 쓰지 않는다.`);
    }
    equal(service.ports ?? [], publications[name] ?? [], `${name} 포트`);
    equal(service.volumes ?? [], mounts[name] ?? [], `${name} 볼륨`);
    if (apps.includes(name)) {
      equal(service.build, { context: "../../templates/fastapi" }, `${name} 빌드`);
      equal(
        service.image,
        "ai-template-web-e2e-fastapi:${WEB_E2E_RUN_ID:?실행 ID를 지정한다}",
        `${name} 이미지`,
      );
      const env = record(service.environment);
      const urls: Record<string, string> = {
        API_URL: URLS.api,
        FRONTEND_URL: URLS.web,
        OAUTH_REDIRECT_URIS: `${URLS.web}/oauth/callback`,
        REALTIME_ALLOWED_ORIGINS: URLS.web,
        STORAGE_ALLOWED_ORIGINS: URLS.web,
        S3_ENDPOINT_URL: "http://seaweedfs:8333",
        S3_PUBLIC_ENDPOINT_URL: URLS.s3,
        DATABASE_URL: "postgresql+psycopg://app:app@postgres:5432/app",
        REDIS_URL: "redis://valkey:6379/0",
        SMTP_URL: "smtp://mailpit:1025",
        RECENT_LOGIN_SECONDS: "10",
      };
      for (const provider of ["google", "kakao", "naver"]) {
        const prefix = `OAUTH_${provider.toUpperCase()}`;
        urls[`${prefix}_AUTHORIZE_URL`] = `${URLS.oauth}/${provider}/authorize`;
        urls[`${prefix}_TOKEN_URL`] = `http://oauth:8080/${provider}/token`;
        urls[`${prefix}_PROFILE_URL`] = `http://oauth:8080/${provider}/userinfo`;
      }
      for (const [key, expected] of Object.entries(urls))
        equal(env[key], expected, `${name}.${key}`);
      for (const [key, setting] of Object.entries(env)) {
        if (
          !/^[A-Z][A-Z0-9_]+$/.test(key) ||
          typeof setting !== "string" ||
          setting.length === 0 ||
          setting.includes("${")
        ) {
          throw new Error(`${name}.${key}: 환경 변수 값을 명시한다.`);
        }
      }
    } else {
      equal(service.image, record(infra)[name], `${name} 이미지`);
      if (service.build !== undefined) throw new Error(`${name}: 고정 인프라 이미지를 쓴다.`);
    }
  }
}
