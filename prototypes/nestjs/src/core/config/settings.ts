import { z } from "zod";
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8000),
  DATABASE_URL: z.url().default("postgresql://app:app@127.0.0.1:25432/app"), // betterleaks:allow - public local example or test credential
  REDIS_URL: z.url().default("redis://127.0.0.1:26379/0"),
  JWT_SECRET: z.string().min(32).default("development-only-jwt-signing-key-32"),
  IDENTIFIER_HASH_SECRET: z.string().min(32).default("development-only-identifier-key-32"),
  SMTP_URL: z.url().default("smtp://127.0.0.1:21025"),
  MAIL_FROM: z.string().default("AI Template <no-reply@example.com>"),
  FRONTEND_URL: z.url().default("http://localhost:3000"),
  MAILPIT_URL: z.url().default("http://127.0.0.1:28025"),
  SEED_ADMIN_EMAIL: z.email().default("admin@example.com"),
  SEED_ADMIN_PASSWORD: z.string().min(8).default("local-admin-password"), // betterleaks:allow
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
