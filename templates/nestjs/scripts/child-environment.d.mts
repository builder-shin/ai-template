export function environment(
  overrides?: NodeJS.ProcessEnv,
  source?: NodeJS.ProcessEnv,
  platform?: NodeJS.Platform,
): NodeJS.ProcessEnv;

export function environmentValue(
  name: string,
  source?: NodeJS.ProcessEnv,
  platform?: NodeJS.Platform,
): string | undefined;
