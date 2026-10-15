import { existsSync } from "node:fs";
import { join } from "node:path";

export type Backend = "fastapi" | "nestjs";
export interface BackendDescriptor {
  readonly backend: Backend;
  readonly template: Backend;
  readonly ownsPackageJson: boolean;
  readonly setupTools: readonly "uv"[];
  readonly apiDockerfile: "app-context" | "root-context";
  readonly reservedName: Backend;
}
export const BACKENDS: Readonly<Record<Backend, BackendDescriptor>> = {
  fastapi: {
    backend: "fastapi",
    template: "fastapi",
    ownsPackageJson: false,
    setupTools: ["uv"],
    apiDockerfile: "app-context",
    reservedName: "fastapi",
  },
  nestjs: {
    backend: "nestjs",
    template: "nestjs",
    ownsPackageJson: true,
    setupTools: [],
    apiDockerfile: "root-context",
    reservedName: "nestjs",
  },
};
export function backendOf(apiFolder: string): Backend {
  return existsSync(join(apiFolder, "pyproject.toml")) ? "fastapi" : "nestjs";
}
