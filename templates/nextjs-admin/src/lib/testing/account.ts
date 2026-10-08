import { createApiClient } from "../api/client";
import type { components } from "../api/schema";

type Account = components["schemas"]["RegistrationCreateAttributes"];
type Options = { origin: string; locale: "ko" | "en"; account: Account; userAgent?: string };
type LoginOptions = Omit<Options, "account"> & {
  account: Pick<Account, "email" | "password">;
  userAgent?: string;
};

function client(origin: string, locale: "ko" | "en", accessToken?: string) {
  return createApiClient({
    baseUrl: `${origin}/api/v1`,
    locale,
    ...(accessToken ? { accessToken } : {}),
    log: () => {},
  });
}

/** 계정 데이터와 언어는 fixture가 정하고 HTTP 준비만 함께 쓴다. */
export async function registerTestAccount({ origin, locale, account, userAgent }: Options) {
  const anonymous = client(origin, locale);
  await anonymous.POST("/registrations", {
    body: { data: { type: "registrations", attributes: account } },
  });
  const response = await fetch(`${origin}/_test/mail?to=${encodeURIComponent(account.email)}`);
  if (!response.ok) throw new Error("테스트 메일 조회 실패");
  const { messages } = (await response.json()) as { messages: { text: string }[] };
  const link = messages[0]?.text.match(/https?:\/\/\S+/)?.[0];
  const token = link ? new URL(link).searchParams.get("token") : null;
  if (!token) throw new Error("테스트 인증 메일에 토큰이 없다.");
  await anonymous.POST("/email-verifications", {
    body: { data: { type: "email-verifications", attributes: { token } } },
  });
  return loginTestAccount({ origin, locale, account, ...(userAgent ? { userAgent } : {}) });
}

export async function loginTestAccount({ origin, locale, account, userAgent }: LoginOptions) {
  const { data } = await client(origin, locale).POST("/sessions", {
    ...(userAgent ? { headers: { "User-Agent": userAgent } } : {}),
    body: {
      data: {
        type: "sessions",
        attributes: { grantType: "password", email: account.email, password: account.password },
      },
    },
  });
  if (!data) throw new Error("테스트 세션이 없다.");
  const session = data.data.attributes;
  return { id: data.data.id, session, client: client(origin, locale, session.accessToken) };
}

/** 시드 관리자 로그인은 일반 계정의 가입과 구분한다. */
export async function loginSeedAccount(options: LoginOptions) {
  return loginTestAccount(options);
}
