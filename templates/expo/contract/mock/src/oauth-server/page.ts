/**
 * 가짜 OAuth 서버의 화면(HTML). 개발하면서 사람이 신원을 골라 로그인하는 폼과, 인가 요청이 틀렸을 때의
 * 안내다. 꾸밈 도구 없이 짧은 인라인 스타일만 쓴다(화면의 뼈대와 이스케이프는 ../html.ts).
 *
 * 폼은 인가 화면 주소(쿼리 포함)로 그대로 POST한다(action이 없다). 필드 이름은 routes.ts가 읽는다.
 * username 입력칸, claims 입력칸, 로그인 버튼(input[type=submit])은 모의 OAuth 서버
 * (navikt/mock-oauth2-server)의 로그인 폼과 같아서, 그 셋으로 로그인하는 E2E가 두 서버에서 함께 돈다.
 * 거부 버튼은 button이라 input[type=submit]에 걸리지 않는다.
 */

import { escapeHtml, htmlPage } from "../html.ts";
import { type OAuthProvider, personClaims } from "./server.ts";

/** 폼에 다시 채울 값. 제출한 값이 틀려 화면을 다시 보여 줄 때 쓴다. */
export interface LoginValues {
  readonly username: string;
  readonly name: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly claims: string;
}

export const EMPTY_LOGIN: LoginValues = {
  username: "",
  name: "",
  email: "",
  emailVerified: false,
  claims: "",
};

const NAMES: Readonly<Record<OAuthProvider, string>> = {
  google: "Google",
  kakao: "카카오",
  naver: "네이버",
};

/** 사용자 id가 들어가는 프로필의 자리. */
const SUBJECT_FIELDS: Readonly<Record<OAuthProvider, string>> = {
  google: "sub",
  kakao: "id",
  naver: "response.id",
};

/** 백엔드가 이 제공자의 이메일을 어떻게 믿는지. */
const NOTES: Readonly<Record<OAuthProvider, string>> = {
  google:
    "확인된 이메일이 gmail.com 주소가 아니면 Workspace 계정(hd)으로 보낸다. 백엔드는 확인된 " +
    "gmail.com 주소와 Workspace 주소만 믿고 같은 이메일의 계정에 연결한다.",
  kakao:
    "확인된 이메일은 is_email_valid와 is_email_verified를 모두 참으로 보낸다. 백엔드는 둘 다 참일 " +
    "때만 같은 이메일의 계정에 연결한다.",
  naver:
    "네이버는 이메일을 확인했는지 알려 주지 않는다. 백엔드는 네이버의 이메일을 늘 확인되지 않은 " +
    "것으로 보고 이메일 없는 계정을 만든다.",
};

const STYLE = `
body { font-family: system-ui, sans-serif; max-width: 34rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
label { display: block; margin-top: 0.75rem; }
input:not([type="checkbox"], [type="submit"]), textarea { display: block; width: 100%; box-sizing: border-box; padding: 0.4rem; font: inherit; }
textarea { font-family: ui-monospace, monospace; }
input[type="submit"], button { margin: 1rem 0.5rem 0 0; padding: 0.4rem 1rem; font: inherit; }
.note { color: #555; font-size: 0.9rem; }
.problem { color: #b00020; }`;

function page(provider: OAuthProvider, body: string): string {
  return htmlPage(`${NAMES[provider]} 로그인 (목)`, STYLE, body);
}

function problemLine(problem: string | undefined): string {
  return problem === undefined
    ? ""
    : `<p class="problem" role="alert">${escapeHtml(problem)}</p>\n`;
}

/** 프로필 claims의 예(이 제공자의 모양). */
function exampleClaims(provider: OAuthProvider): string {
  const person = {
    subject: "user-1",
    email: "user@example.com",
    emailVerified: true,
    name: "사용자",
  };
  return JSON.stringify(personClaims(provider, person), null, 2);
}

function input(name: string, value: string, extra = ""): string {
  return `<input name="${name}" value="${escapeHtml(value)}"${extra}>`;
}

/** 이메일 확인 여부. 네이버는 알려 주지 않으므로 없다. */
function verifiedBox(provider: OAuthProvider, checked: boolean): string {
  if (provider === "naver") return "";
  const box = `<input name="emailVerified" type="checkbox" value="true"${checked ? " checked" : ""}>`;
  return `<label>${box} 제공자가 확인한 이메일</label>\n`;
}

/** 로그인 폼. problem이 있으면 폼 위에 알린다. */
export function loginPage(
  provider: OAuthProvider,
  values: LoginValues = EMPTY_LOGIN,
  problem?: string,
): string {
  const verified = verifiedBox(provider, values.emailVerified);
  const body = `<p class="note">목 서버의 가짜 제공자 화면이다. 고른 신원으로 로그인한 것처럼 백엔드로 돌아간다. ${escapeHtml(NOTES[provider])}</p>
${problemLine(problem)}<form method="post">
<label>사용자 id(${SUBJECT_FIELDS[provider]}) ${input("username", values.username, ' required autocomplete="off" autofocus')}</label>
<label>이름 ${input("name", values.name)}</label>
<label>이메일 ${input("email", values.email, ' type="email"')}</label>
${verified}<details${values.claims === "" ? "" : " open"}>
<summary>claims(JSON)로 직접 쓰기</summary>
<p class="note">쓰면 이름과 이메일 대신 이 JSON 객체가 프로필이 된다. 사용자 id는 sub로 들어간다(모의 OAuth 서버와 같다). 이 제공자의 모양은 입력칸의 예와 같다.</p>
<textarea name="claims" rows="10" placeholder="${escapeHtml(exampleClaims(provider))}">${escapeHtml(values.claims)}</textarea>
</details>
<input type="submit" value="로그인">
<button type="submit" name="error" value="access_denied" formnovalidate>거부</button>
</form>`;
  return page(provider, body);
}

/** 인가 요청이 틀렸을 때의 안내. 돌려보낼 곳을 믿을 수 없으므로 돌려보내지 않는다. */
export function requestProblemPage(provider: OAuthProvider, problem: string): string {
  const body = `${problemLine(`인가 요청이 틀렸다: ${problem}`)}<p class="note">이 화면은 백엔드의 GET /api/v1/oauth/${provider}/authorize가 브라우저를 보내는 곳이다. 그 주소에서 시작한다.</p>`;
  return page(provider, body);
}
