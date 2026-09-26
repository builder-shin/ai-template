/** 저장소가 쓰는 외부 바이너리. 버전을 올릴 때는 GitHub 릴리스의 checksums.txt에서 sha256을 함께 옮긴다. */

export const PLATFORMS = [
  "win32-x64",
  "linux-x64",
  "linux-arm64",
  "darwin-x64",
  "darwin-arm64",
] as const;

export type Platform = (typeof PLATFORMS)[number];

export interface ToolAsset {
  readonly file: string;
  readonly sha256: string;
}

export interface ToolSpec {
  readonly name: string;
  readonly version: string;
  /** GitHub 저장소. 예: oasdiff/oasdiff */
  readonly repo: string;
  readonly tag: string;
  /** 확장자 없는 실행 파일 이름. Windows에서는 .exe를 붙인다. */
  readonly binary: string;
  readonly assets: Readonly<Partial<Record<Platform, ToolAsset>>>;
}

const OASDIFF_DARWIN: ToolAsset = {
  file: "oasdiff_1.32.1_darwin_all.tar.gz",
  sha256: "e4d74b7e2dfb9d4819e7fc720c905ec86547e4637ac270a2b0187c0f1fb7187e",
};

export const TOOLS = {
  oasdiff: {
    name: "oasdiff",
    version: "1.32.1",
    repo: "oasdiff/oasdiff",
    tag: "v1.32.1",
    binary: "oasdiff",
    assets: {
      "win32-x64": {
        file: "oasdiff_1.32.1_windows_amd64.tar.gz",
        sha256: "4d0758b32d454e6011e59db93884af1ca27ae2b212d990f36738ea5efb5d7f28",
      },
      "linux-x64": {
        file: "oasdiff_1.32.1_linux_amd64.tar.gz",
        sha256: "7c8939fc49b75ee11fec66a5b83b37a2fca6aee109fed85013b1ba2ac2a1ee7f",
      },
      "linux-arm64": {
        file: "oasdiff_1.32.1_linux_arm64.tar.gz",
        sha256: "32fff58a120f75a723d6c2422444691c37fa6813fed61d23f53dbcb604b30f6d",
      },
      "darwin-x64": OASDIFF_DARWIN,
      "darwin-arm64": OASDIFF_DARWIN,
    },
  },
  betterleaks: {
    name: "betterleaks",
    version: "1.8.1",
    repo: "betterleaks/betterleaks",
    tag: "v1.8.1",
    binary: "betterleaks",
    assets: {
      "win32-x64": {
        file: "betterleaks_1.8.1_windows_x64.zip",
        sha256: "94310d028285a1bcce7f160bc19eb62f87de6460c95bfd4319151ef5b501ed3f",
      },
      "linux-x64": {
        file: "betterleaks_1.8.1_linux_x64.tar.gz",
        sha256: "efa407244e1ea8e35f582b8a42becdeac08bdead04f68eb752adda722d583c2a",
      },
      "linux-arm64": {
        file: "betterleaks_1.8.1_linux_arm64.tar.gz",
        sha256: "bbb578b12a2f65d7082ab436abf37724232bc71d8a078e3c41336574420f1b48",
      },
      "darwin-x64": {
        file: "betterleaks_1.8.1_darwin_x64.tar.gz",
        sha256: "6abc37df76f881cffae406aa2cec72bea6e6ae64b4e771b3ed21b4aac472ed10",
      },
      "darwin-arm64": {
        file: "betterleaks_1.8.1_darwin_arm64.tar.gz",
        sha256: "8e80f33b5f2a7426b390347b9fd466033723cb94b6bdffa7572632e2eaec964e",
      },
    },
  },
} as const satisfies Record<string, ToolSpec>;

export type ToolName = keyof typeof TOOLS;

export function isToolName(value: string): value is ToolName {
  return Object.hasOwn(TOOLS, value);
}
