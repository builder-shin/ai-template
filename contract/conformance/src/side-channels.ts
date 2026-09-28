import type { components } from "./generated/api.ts";

export type OAuthProvider = components["schemas"]["OAuthProvider"];

export interface ReceivedMail {
  /** 메일함이 붙인 id. */
  readonly id: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  /** 메일함이 받은 시각(ISO 8601). 메일함의 시계라 테스트를 돌리는 PC의 시계와 다를 수 있다. */
  readonly receivedAt: string;
}

export interface LatestOptions {
  /** 기다리는 한도(밀리초). 기본 10초. */
  readonly timeoutMs?: number;
  /** 이 메일보다 뒤에 받은 메일만 본다. 같은 주소로 두 번 보낸 메일(재발송)을 가린다. */
  readonly after?: ReceivedMail;
  /**
   * 본문에 이 경로의 토큰 링크(`<경로>?token=`)가 있는 메일만 본다. 메일 종류를 가린다(MAIL_LINKS).
   * 제목은 백엔드와 로케일마다 문구가 달라 조건으로 쓰지 않는다.
   */
  readonly linkPath?: string;
}

/** 대상이 보낸 메일을 읽는다. 실제 백엔드는 Mailpit으로, 목은 테스트 전용 엔드포인트로 구현한다. */
export interface Mailbox {
  /** 받는 사람에게 온 가장 최근 메일 가운데 조건에 맞는 것. 제한 시간 안에 오지 않으면 던진다. */
  latest(to: string, options?: LatestOptions): Promise<ReceivedMail>;
  clear(): Promise<void>;
}

/** 소셜 로그인 제공자가 알려 줄 사람. 모의 서버가 제공자마다 다른 모양의 신원 응답으로 흉내 낸다. */
export interface OAuthPerson {
  /** 제공자 안의 사용자 id. 같은 값이면 같은 사람이다. */
  readonly subject: string;
  readonly email?: string;
  /** 제공자가 그 이메일의 주인임을 확인했는가(기본 false). 네이버는 백엔드가 늘 미검증으로 본다. */
  readonly emailVerified?: boolean;
  /** 이름. 모의 서버가 비ASCII 값을 깨뜨리므로 ASCII로 쓴다. */
  readonly name?: string;
}

export interface OAuthStart {
  /** authorize가 보낸 제공자 로그인 화면 주소. */
  readonly providerUrl: string;
  /** 그 주소에 붙은 state. */
  readonly state: string;
  /** 이 흐름을 위해 드라이버가 만든 PKCE code verifier. authorize에 보낸 codeChallenge는 이것의 S256이다. */
  readonly codeVerifier: string;
}

/** signIn이 끝나고 돌아온 프론트 콜백의 쿼리(code 또는 error)와, 코드를 토큰으로 바꿀 code verifier. */
export interface OAuthReturn {
  readonly query: URLSearchParams;
  readonly codeVerifier: string;
}

/** 브라우저 대신 소셜 로그인을 진행한다. 결과는 프론트 콜백 주소의 쿼리(code 또는 error)다. */
export interface OAuthDriver {
  /** 백엔드 authorize를 불러 제공자 주소와 state를 얻는다. codeChallenge는 드라이버가 새로 만든다. */
  start(provider: OAuthProvider, redirectUri: string): Promise<OAuthStart>;
  /** 제공자에서 person으로 로그인하고 백엔드 콜백을 거친다. */
  signIn(provider: OAuthProvider, redirectUri: string, person: OAuthPerson): Promise<OAuthReturn>;
  /** 제공자가 돌려보낸 것처럼 백엔드 콜백을 직접 부른다(거부, 틀린 코드). */
  callback(
    provider: OAuthProvider,
    params: Readonly<Record<string, string>>,
  ): Promise<URLSearchParams>;
}

export interface SideChannels {
  readonly mailbox: Mailbox;
  readonly oauth: OAuthDriver;
}

/** 메일 링크의 프론트 경로(docs/conventions/jsonapi.md의 "메일 링크"). 뒤에 ?token=<토큰>이 붙는다. */
export const MAIL_LINKS = {
  emailVerification: "/verify-email",
  passwordReset: "/reset-password",
} as const;

/** after보다 뒤에 받은 메일인가. after가 없으면 늘 그렇다. 메일함 구현이 함께 쓴다. */
export function receivedAfter(
  mail: Pick<ReceivedMail, "id" | "receivedAt">,
  after: ReceivedMail | undefined,
): boolean {
  if (after === undefined) return true;
  return mail.id !== after.id && Date.parse(mail.receivedAt) >= Date.parse(after.receivedAt);
}

/** 메일이 latest의 조건(after, linkPath)에 맞는가. 메일함 구현이 함께 쓴다. */
export function matchesMail(mail: ReceivedMail, options: LatestOptions): boolean {
  const { after, linkPath } = options;
  return (
    receivedAfter(mail, after) &&
    (linkPath === undefined || mail.text.includes(`${linkPath}?token=`))
  );
}

/** 인증·재설정 메일 본문의 링크에서 token 쿼리 값을 꺼낸다. */
export function extractToken(mail: ReceivedMail): string {
  const token = /[?&]token=([A-Za-z0-9._~-]+)/.exec(mail.text)?.[1];
  if (token === undefined) {
    throw new Error(`메일 "${mail.subject}"에서 token 쿼리가 있는 링크를 찾지 못했다`);
  }
  return token;
}
