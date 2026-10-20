import { expect, it } from "vitest";
import { stringify } from "yaml";
import { mergeWorkspace, type WorkspaceDocument } from "../src/workspace.ts";

function workspace(packages = ["apps/web", "contract/*"]): WorkspaceDocument {
  return {
    packages,
    minimumReleaseAge: 1440,
    allowBuilds: { esbuild: true },
    overrides: { typescript: "6.0.3" },
  };
}

it.each(["첫 프론트", "다음 프론트", "API", "제외한 API"])(
  "알 수 없는 workspace 키를 이름과 함께 거절한다 (%s)",
  (location) => {
    const frontends = [workspace(), workspace(["apps/admin", "contract/*"])] as const;
    const api = workspace();
    const document =
      location === "첫 프론트" ? frontends[0] : location === "다음 프론트" ? frontends[1] : api;
    Object.assign(document, { catalog: { zod: "4.6.5" } });
    expect(() => mergeWorkspace({ frontends, api, includeApi: location !== "제외한 API" })).toThrow(
      expect.objectContaining({
        name: "CreateError",
        message:
          "pnpm new: 지원하지 않는 workspace 설정이다: catalog — workspace 정책과 병합 규칙을 함께 검토한다.",
      }),
    );
  },
);

it.each([0, 1] as const)("문자열 workspace 입력의 알 수 없는 키도 거절한다 (%s)", (index) => {
  const documents = [workspace(), workspace()] as const;
  Object.assign(documents[index], { catalog: { zod: "4.6.5" } });
  expect(() =>
    mergeWorkspace(
      documents.map((document, index) => ({
        app: index === 0 ? "web" : "admin",
        source: stringify(document),
      })),
      "6.0.3",
    ),
  ).toThrow(
    expect.objectContaining({
      name: "CreateError",
      message:
        "pnpm new: 지원하지 않는 workspace 설정이다: catalog — workspace 정책과 병합 규칙을 함께 검토한다.",
    }),
  );
});

it("허용한 workspace 키의 병합과 원본을 보존한다", () => {
  const frontends = [workspace(), workspace(["apps/admin", "contract/*"])];
  const api = { ...workspace(), allowBuilds: { argon2: true } };
  const before = structuredClone({ frontends, api });
  expect(mergeWorkspace({ frontends, api })).toEqual({
    ...workspace(),
    packages: ["apps/api", "apps/web", "apps/admin", "contract/*"],
    allowBuilds: { esbuild: true, argon2: true },
  });
  expect({ frontends, api }).toEqual(before);
});
