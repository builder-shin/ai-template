import type { ChildProcess, SpawnOptions } from "node:child_process";
export function startProcessTree(args: readonly string[], options?: SpawnOptions): ChildProcess;
export function stopProcessTree(
  child: ChildProcess,
  graceMs?: number,
  deps?: {
    kill?: (pid: number, signal: NodeJS.Signals | 0) => void;
    platform?: NodeJS.Platform;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    taskkill?: (pid: number) => void;
  },
): Promise<void>;
