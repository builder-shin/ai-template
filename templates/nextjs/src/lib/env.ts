import { z } from "zod";

export const EXAMPLE_SESSION_SECRET = "dev-only-change-this-session-secret"; // betterleaks:allow 사유: 운영에서 거절하는 공개 개발 예시
const httpUrl = z.url({ protocol: /^https?$/ });

export const envSchema = z.object({
  API_BASE_URL: httpUrl,
  APP_URL: httpUrl,
  SESSION_SECRET: z.string().refine((value) => Buffer.byteLength(value, "utf8") >= 32),
  TIME_ZONE: z
    .string()
    .default("Asia/Seoul")
    .refine((zone) => {
      try {
        new Intl.DateTimeFormat("ko", { timeZone: zone });
        return true;
      } catch {
        return false;
      }
    }),
  NEXT_PUBLIC_REALTIME_URL: httpUrl,
});

const hints: Record<keyof z.infer<typeof envSchema>, string> = {
  API_BASE_URL: "http(s) API 주소를 설정한다.",
  APP_URL: "http(s) web 주소를 설정한다.",
  SESSION_SECRET: "32바이트 이상의 비밀을 설정한다.",
  TIME_ZONE: "유효한 IANA 시간대를 설정한다.",
  NEXT_PUBLIC_REALTIME_URL: "http(s) 실시간 서버 주소를 설정한다.",
};

export function parseEnv(input: Record<string, string | undefined>, mode = input.NODE_ENV) {
  const result = envSchema.safeParse(input);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(keys.map((key) => `${key}: ${hints[key as keyof typeof hints]}`).join("\n"));
  }
  if (mode === "production" && result.data.SESSION_SECRET === EXAMPLE_SESSION_SECRET) {
    throw new Error("SESSION_SECRET: 운영에서는 예시 값을 새 비밀로 바꾼다.");
  }
  return result.data;
}

export function getEnv() {
  return parseEnv(process.env);
}
