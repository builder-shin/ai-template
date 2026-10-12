import { z } from "zod";
import { allowedOrigins } from "../realtime/origins.js";
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8000),
  DATABASE_URL: z.url().default("postgresql://app:app@127.0.0.1:25432/app"), // betterleaks:allow - public local example or test credential
  RATE_LIMIT_GLOBAL: z.coerce.number().int().positive().default(1000),
  RATE_LIMIT_STRICT: z.coerce.number().int().positive().default(100),
  FORWARDED_ALLOW_IPS: z
    .string()
    .refine(
      (value) =>
        !value
          .split(",")
          .map((x) => x.trim())
          .includes("*"),
    )
    .default("127.0.0.1,::1"),
  REALTIME_ALLOWED_ORIGINS: z
    .string()
    .refine((value) => {
      try {
        allowedOrigins(value);
        return true;
      } catch {
        return false;
      }
    })
    .default("http://localhost:3000"),
  REDIS_URL: z.url().default("redis://127.0.0.1:26379/0"),
  JWT_SECRET: z.string().min(32).default("development-only-jwt-signing-key-32"),
  IDENTIFIER_HASH_SECRET: z.string().min(32).default("development-only-identifier-key-32"),
  SMTP_URL: z.url().default("smtp://127.0.0.1:21025"),
  MAIL_FROM: z.string().default("AI Template <no-reply@example.com>"),
  FRONTEND_URL: z.url().default("http://localhost:3000"),
  MAILPIT_URL: z.url().default("http://127.0.0.1:28025"),
  S3_ENDPOINT_URL: z.url().default("http://127.0.0.1:28333"),
  S3_PUBLIC_ENDPOINT_URL: z.url().default("http://127.0.0.1:28333"),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().min(1).default("app"),
  S3_ACCESS_KEY_ID: z.string().default("app"),
  S3_SECRET_ACCESS_KEY: z.string().default("app-secret"), // betterleaks:allow - public development credential
  S3_KEY_PREFIX: z.string().default(""),
  STORAGE_ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
  FILE_MAX_SIZE: z.coerce.number().int().positive().default(10_485_760),
  FILE_USER_QUOTA: z.coerce.number().int().positive().default(1_073_741_824),
  FILE_ALLOWED_TYPES: z.string().default("image/png,image/jpeg,image/webp,image/gif"),
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
