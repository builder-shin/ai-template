export interface CommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  allowFailure?: boolean;
}
export interface NativeMeasurement {
  id: string;
  command: string;
  args: readonly string[];
  cwd: string;
  utcStart: string;
  utcEnd: string;
  elapsedSeconds: number;
  nativeExit: number | null;
  pid: number | null;
  signal: NodeJS.Signals | null;
  error: string | null;
  diagnosticNonzeroAllowed: boolean;
  preflight: {
    physicalTmp: string;
    childTmpdir: string;
    conservativePipeBytes: number;
    nodeVersion: string;
    pnpmVersion: string | undefined;
    pnpmNativeExit: number | null;
    elapsedSeconds: number;
  };
  stdoutSHA256: string;
  stderrSHA256: string;
}
export interface CommandResult {
  stdout: string;
  stderr: string;
  row: NativeMeasurement;
}
export type NativeRunner = (
  label: string,
  command: string,
  args?: readonly string[],
  options?: CommandOptions,
) => CommandResult;

export function measures(directory: string): {
  run: NativeRunner;
  rows: NativeMeasurement[];
};
export function frontendDifferences(
  clone: string,
  target: string,
  api: string,
  frontends: readonly string[],
  run: NativeRunner,
  directory: string,
  id: string,
): void;
