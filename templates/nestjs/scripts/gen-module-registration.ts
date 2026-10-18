import type { ModuleNames } from "./gen-module-transform.js";
import { extendModuleOracles } from "./gen-module-oracles.js";

export function registerModule(
  read: (path: string) => string,
  names: ModuleNames,
): Map<string, string> {
  const output = new Map<string, string>();
  function replace(path: string, anchor: string, inserted: string) {
    const text = output.get(path) ?? read(path);
    if (text.split(anchor).length !== 2)
      throw new Error(`${path}: 골든 등록 위치가 하나가 아니다. 모듈 레시피를 확인한다`);
    output.set(path, text.replace(anchor, anchor + inserted));
  }
  function rewrite(path: string, pattern: RegExp, update: (value: string) => string) {
    const text = output.get(path) ?? read(path);
    const matches = [...text.matchAll(new RegExp(pattern.source, pattern.flags + "g"))];
    if (matches.length !== 1) throw new Error(`${path}: 구조화한 등록 위치가 하나가 아니다`);
    output.set(path, text.replace(pattern, update));
  }
  const { name, singular, pluralClass, model, plural, single } = names;
  const app = "src/app.module.ts";
  replace(
    app,
    'import { PostsModule } from "./modules/posts/index.js";',
    `\nimport { ${pluralClass}Module, ${pluralClass}Repository } from "./modules/${name}/index.js";`,
  );
  replace(
    app,
    "PostsModule.register(infrastructure, [files, realtime]),",
    `\n${pluralClass}Module.register(infrastructure, [files, realtime]),`,
  );
  replace(
    app,
    "// gen:module file references",
    `\n(tx, id) => new ${pluralClass}Repository().coverReferenceCount(tx, id),`,
  );
  const registry = "src/modules/registry.ts";
  replace(
    registry,
    'import { PostsRepository } from "./posts/index.js";',
    `\nimport { ${pluralClass}Repository } from "./${name}/index.js";\nconst ${single}CoverReadRule: Parameters<typeof registerFileReadRule>[0] = (tx, viewer, ids) => new ${pluralClass}Repository().readableCoverIds(tx, ids, viewer);`,
  );
  replace(
    registry,
    "registerFileReadRule(coverReadRule);",
    `\nregisterFileReadRule(${single}CoverReadRule);`,
  );
  rewrite(
    "src/core/security/permissions.ts",
    /export const PERMISSION_CODES = \[[\s\S]*?\] as const;/,
    (value) =>
      value.replace(/\] as const;$/, `  "${name}:create",\n  "${name}:manage",\n] as const;`),
  );
  replace(
    "src/modules/roles/permissions.ts",
    '  "posts:manage": "Manage every post, including drafts.",',
    `\n  "${name}:create": "${name} 리소스를 만든다.",\n  "${name}:manage": "모든 ${name} 리소스를 관리한다.",`,
  );
  replace(
    "src/core/audit/actions.ts",
    '  "post.deleted_by_admin",',
    `\n  "${singular}.deleted_by_admin",`,
  );
  replace(
    "src/core/jsonapi/error-codes.ts",
    '  "post.invalid_transition",',
    `\n  "${singular}.invalid_transition",`,
  );
  const realtime = "src/core/realtime/declarations.ts";
  rewrite(
    realtime,
    /export type RealtimeEventName =[\s\S]*?;/,
    (value) =>
      value.slice(0, -1) +
      ["created", "updated", "published", "unpublished", "deleted"]
        .map((event) => `\n  | "${singular}.${event}"`)
        .join("") +
      ";",
  );
  rewrite(
    realtime,
    /export type RealtimeChannelName =[\s\S]*?;/,
    (value) => value.slice(0, -1) + ` | "${name}" | "${name}:all";`,
  );
  const subscriptions = "src/modules/realtime/schemas.ts";
  rewrite(
    subscriptions,
    /registerComponent\(\s*"RealtimeChannel",\s*z\.enum\(\[[\s\S]*?\]\)/,
    (value) => value.replace(/,?\s*\]\)$/, `, "${name}", "${name}:all"])`),
  );
  rewrite(
    subscriptions,
    /defineRealtimeMessage\("subscribe", "RealtimeSubscription", "RealtimeAck"\);/,
    (value) =>
      `defineRealtimeChannel("${name}", null);\ndefineRealtimeChannel("${name}:all", "${name}:manage");\n${value}`,
  );
  const schema = read("prisma/schema.prisma");
  const status = /enum PostStatus \{[^}]+\}/.exec(schema)?.[0];
  const post = /model Post \{[^}]+\}/.exec(schema)?.[0];
  if (!status || !post) throw new Error("prisma/schema.prisma: 골든 Post 모델이 없다");
  const models = `${status}\n\n${post}`
    .replace(/\bPostStatus\b/g, `${model}Status`)
    .replace(/\bPost\b/g, model)
    .replace('@@map("posts")', `@@map("${names.table}")`);
  output.set(
    "prisma/schema.prisma",
    schema.replace(/(\s+posts\s+Post\[\])/g, `$1\n  ${plural} ${model}[]`) + `\n${models}\n`,
  );
  const baseline = "scripts/tests/gen-bootstrap.test.ts";
  rewrite(baseline, /expect\(schemas\.PermissionCode\?\.enum\)\.toEqual\(\[[\s\S]*?\]\)/, (value) =>
    value.replace(/\]\)$/, `  "${name}:create",\n  "${name}:manage",\n])`),
  );
  const seedFixture = "src/modules/roles/tests/seed.test.ts";
  rewrite(
    seedFixture,
    /expect\(\s*db\.roles\.find\(\(r\) => r\.name === "admin"\)\?\.permissions,?\s*\)\.toHaveLength\(\s*\d+,?\s*\)/,
    (value) =>
      value.replace(
        /\.toHaveLength\(\s*(\d+),?\s*\)$/,
        (_whole, count: string) => `.toHaveLength(${String(Number(count) + 2)})`,
      ),
  );
  rewrite(seedFixture, /new Set\(\[\s*"admin:access",[\s\S]*?\]\)/, (value) =>
    value.replace(/\]\)$/, `  "${name}:create",\n  "${name}:manage",\n])`),
  );
  rewrite(
    "src/modules/realtime/tests/module.test.ts",
    /expect\(document\["x-realtime-channels"\]\)\.toEqual\(\[[\s\S]*?\]\)/,
    (value) =>
      value.replace(
        /\]\)$/,
        `  { name: "${name}", permission: null },\n  { name: "${name}:all", permission: "${name}:manage" },\n])`,
      ),
  );
  for (const [family, anchor, transaction] of [
    ["files", "const result = await fn({", "state"],
    ["users", "const tx = {", "db"],
    ["posts", "const tx = {", "db"],
  ] as const) {
    replace(
      `src/modules/${family}/tests/fixtures.ts`,
      anchor,
      `\n${single}: {
        findMany: () => { ${transaction}(); return Promise.resolve([]); },
        count: () => { ${transaction}(); return Promise.resolve(0); },
      },`,
    );
  }
  for (const [path, text] of extendModuleOracles(read, names)) output.set(path, text);
  for (const [path, text] of output) {
    const previous = read(path);
    const collision = path.endsWith("schema.prisma")
      ? new RegExp(`\\b(?:model ${model}|enum ${model}Status)\\b`).test(previous)
      : previous.includes(`"${name}:manage"`) ||
        previous.includes(`"${name}:create"`) ||
        previous.includes(`"${singular}.created"`) ||
        new RegExp(`\\b${pluralClass}Module\\b`).test(previous);
    if (collision) throw new Error(`${path}: ${name} 등록이 이미 있다`);
    if (text === previous) throw new Error(`${path}: 새 모듈을 등록하지 못했다`);
  }
  return output;
}
