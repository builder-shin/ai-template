import { join } from "node:path";

// CI의 캐시 경로도 이 위치에 맞춘다.
export const TOOL_CACHE_DIR = join(process.cwd(), "node_modules", ".cache", "ai-template-tools");
