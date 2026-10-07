import config from "../../app.config.json" with { type: "json" };

/** @typedef {{app: string, ports: {dev: number, mock: number, e2e: number, e2eMock: number}}} AppConfig */

/** @param {unknown} value @returns {AppConfig} */
export function parseAppConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("app.config.json 설정이 잘못됐다 — app과 ports가 있는 객체를 넣는다.");
  if (
    !("app" in value) ||
    typeof value.app !== "string" ||
    !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value.app)
  )
    throw new Error("app.config.json 앱 이름이 잘못됐다 — 소문자로 시작하는 kebab-case를 넣는다.");
  if (
    !("ports" in value) ||
    !value.ports ||
    typeof value.ports !== "object" ||
    Array.isArray(value.ports)
  )
    throw new Error("app.config.json 포트가 없다 — ports에 dev, mock, e2e, e2eMock을 넣는다.");
  const keys = /** @type {const} */ (["dev", "mock", "e2e", "e2eMock"]);
  const ports = Object.fromEntries(keys.map((key) => [key, Reflect.get(value.ports, key)]));
  if (
    keys.some((key) => !Number.isInteger(ports[key]) || ports[key] < 1024 || ports[key] > 65535) ||
    new Set(Object.values(ports)).size !== keys.length
  )
    throw new Error(
      "app.config.json 포트가 잘못됐다 — 1024–65535의 서로 다른 정수 네 개를 넣는다.",
    );
  return { app: value.app, ports: /** @type {AppConfig["ports"]} */ (ports) };
}

export const appConfig = parseAppConfig(config);

/** @param {keyof AppConfig["ports"]} port @param {string} [host] */
export function appOrigin(port, host = "localhost") {
  return `http://${host}:${appConfig.ports[port]}`;
}

/** @param {string | undefined} [mode] */
export function appSessionCookieName(mode = process.env.NODE_ENV) {
  return `${mode === "production" ? "__Host-" : ""}${appConfig.app}-session`;
}
