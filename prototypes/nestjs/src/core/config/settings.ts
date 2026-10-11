import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8000),
});

export type Settings = Readonly<z.infer<typeof schema>>;
export const SETTINGS = Symbol("SETTINGS");

export function loadSettings(env: NodeJS.ProcessEnv): Settings {
  const result = schema.safeParse(env);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((issue) => issue.path[0]))].sort();
    throw new Error(`Invalid environment variables: ${keys.join(", ")}`);
  }
  return Object.freeze(result.data);
}
