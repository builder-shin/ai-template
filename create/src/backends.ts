import { existsSync } from "node:fs";
import { join } from "node:path";

export type Backend = "fastapi" | "nestjs";
export interface BackendDescriptor {
  readonly template: Backend;
  readonly ownsPackageJson: boolean;
  readonly setupTools: readonly string[];
  readonly apiDockerfile: "app-context" | "root-context";
  readonly reservedName: string;
}
export const backends: Readonly<Record<Backend, BackendDescriptor>> = {
  fastapi: {
    template: "fastapi",
    ownsPackageJson: false,
    setupTools: ["pnpm", "uv", "docker"],
    apiDockerfile: "app-context",
    reservedName: "fastapi",
  },
  nestjs: {
    template: "nestjs",
    ownsPackageJson: true,
    setupTools: ["pnpm", "docker"],
    apiDockerfile: "root-context",
    reservedName: "nestjs",
  },
};
export function backendOf(apiFolder: string): Backend {
  return existsSync(join(apiFolder, "pyproject.toml")) ? "fastapi" : "nestjs";
}
