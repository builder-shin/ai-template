import { parse } from "yaml";
import { record } from "../web-e2e/config.ts";
import { createMobilePlan, type MobilePlan } from "./plan.ts";
function equal(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`Native compose ${label} must use dedicated resources.`);
}
export function validateMobileCompose(text: string, plan: MobilePlan): void {
  const expected = createMobilePlan(plan.backend, plan.runId);
  equal(plan.project, expected.project, "project");
  equal(plan.composeFile, expected.composeFile, "file");
  const doc = record(parse(text, { merge: true }) as unknown),
    services = record(doc.services),
    volumes = record(doc.volumes);
  equal(Object.keys(doc).sort(), ["services", "volumes", "x-app"], "structure");
  equal(Object.keys(volumes).sort(), ["postgres-data", "seaweedfs-data"], "volumes");
  for (const volume of Object.values(volumes))
    if (volume !== null) equal(volume, {}, "volume ownership");
  const infra: Record<string, string> = {
    postgres: "postgres:18.6-alpine",
    valkey: "valkey/valkey:9.1.2",
    seaweedfs: "chrislusf/seaweedfs:4.47",
    mailpit: "axllent/mailpit:v1.31.2",
    oauth: "ghcr.io/navikt/mock-oauth2-server:6.0.3",
  };
  const apps = ["api", "worker", "scheduler", "migrate", "storage-init"];
  equal(Object.keys(services).sort(), [...Object.keys(infra), ...apps].sort(), "service list");
  for (const [name, value] of Object.entries(services)) {
    const service = record(value);
    const allowed = [
      "build",
      "image",
      "environment",
      "command",
      "depends_on",
      "healthcheck",
      "ports",
      "volumes",
    ];
    if (Object.keys(service).some((key) => !allowed.includes(key)))
      throw new Error("Unsafe native service configuration.");
    if (apps.includes(name)) {
      equal(service.volumes, undefined, "API mounts");
      equal(
        service.image,
        `ai-template-mobile-e2e-${plan.backend}:` + "${MOBILE_E2E_RUN_ID:?실행 ID를 지정한다}",
        "API image",
      );
      equal(
        service.build,
        {
          context: "${MOBILE_E2E_BUILD_CONTEXT:?generated API context required}",
          ...(plan.backend === "nestjs" ? { dockerfile: "apps/api/Dockerfile" } : {}),
        },
        "generated API context",
      );
      const env = record(service.environment);
      equal(env.API_URL, "http://127.0.0.1:4112", "API public URL");
      equal(env.S3_PUBLIC_ENDPOINT_URL, plan.urls.s3, "original signed storage URL");
      equal(
        env.OAUTH_REDIRECT_URIS,
        "${MOBILE_E2E_CALLBACK:?native callback required}",
        "native callback",
      );
    } else equal(service.image, infra[name], "infrastructure image");
    const publications: Record<string, string[]> = {
      api: ["127.0.0.1:18102:8000"],
      seaweedfs: ["127.0.0.1:28435:8333"],
      mailpit: ["127.0.0.1:28127:8025"],
      oauth: ["127.0.0.1:28182:8080"],
    };
    equal(service.ports, publications[name], "ports");
    if (name === "postgres")
      equal(service.volumes, ["postgres-data:/var/lib/postgresql"], "DB mount");
    else if (name === "seaweedfs")
      equal(service.volumes, ["seaweedfs-data:/data"], "storage mount");
    else equal(service.volumes, undefined, "mounts");
  }
}
