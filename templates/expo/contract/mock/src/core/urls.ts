/**
 * URL 도구. FastAPI(Python 3.14의 urllib.parse)가 URL을 나누고, 쿼리를 읽고 쓰고, 인코딩하는 방식을
 * 그대로 옮긴다. 소셜 로그인의 리다이렉트(redirectUri 검사, 돌려보낼 주소에 붙이는 쿼리, Location
 * 헤더)가 쓴다. WHATWG URL(new URL)은 주소를 정규화해서(빈 경로의 /, 퍼센트 인코딩 등) 결과가
 * FastAPI와 달라지므로 쓰지 않는다.
 *
 * - urlsplit: 앞의 C0 제어 문자와 공백을 지우고, 탭과 줄바꿈을 모두 지우고, 스킴을 소문자로 바꾼다.
 *   대괄호 호스트(IPv6, IPvFuture)가 틀렸거나 netloc이 NFKC 정규화로 구분자를 만들면 UrlError다(Python의
 *   ValueError).
 * - parseQsl은 빈 값을 버린다(keep_blank_values=False). urlencode는 quote_plus로 인코딩한다.
 */

import { isIPv4, isIPv6 } from "node:net";

/** Python이 URL을 나누지 못해 ValueError를 던지는 경우. */
export class UrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlError";
  }
}

/** urlsplit의 결과. 없는 부분은 빈 문자열이다. */
export interface UrlParts {
  readonly scheme: string;
  readonly netloc: string;
  readonly path: string;
  readonly query: string;
  readonly fragment: string;
}

/** 앞의 C0 제어 문자(U+0000~U+001F)와 공백: U+0021 이상이 아닌 글자다. */
const LEADING_C0_OR_SPACE = /^[^\u0021-\uffff]+/;
const TAB_OR_NEWLINE = /[\t\n\r]/g;
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*$/;
const IPV_FUTURE = /^[vV][a-fA-F0-9]+\.[^\n]+$/;
const NON_ASCII = /[\u0080-\uffff]/;
/** ASCII(U+0000~U+007F) 글자가 이어진 구간. */
const ASCII_RUN = /[^\u0080-\uffff]+/g;
/** netloc을 두는 스킴(urllib.parse.uses_netloc). urlunsplit이 빈 netloc의 //를 되살릴 때 본다. */
const USES_NETLOC: ReadonlySet<string> = new Set([
  ...["", "ftp", "http", "gopher", "nntp", "telnet", "imap", "wais", "file", "mms", "https"],
  ...["shttp", "snews", "prospero", "rtsp", "rtsps", "rtspu", "rsync", "svn", "svn+ssh", "sftp"],
  ...["nfs", "git", "git+ssh", "ws", "wss", "itms-services"],
]);
/** 늘 인코딩하지 않는 글자(urllib.parse._ALWAYS_SAFE). */
const ALWAYS_SAFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.-~";
/** Python의 bytes.decode("utf-8", "replace")와 같다. BOM도 글자로 남긴다. */
const UTF8 = new TextDecoder("utf-8", { ignoreBOM: true });

/** ipaddress.ip_address가 받는 IPv6 주소. 영역(%eth0)은 비어 있지 않고 %가 없어야 한다. */
function isPythonIPv6(value: string): boolean {
  const percent = value.indexOf("%");
  if (percent === -1) return isIPv6(value);
  const zone = value.slice(percent + 1);
  return zone !== "" && !zone.includes("%") && isIPv6(value.slice(0, percent));
}

/** 대괄호 안의 호스트(_check_bracketed_host): IPvFuture이거나 IPv6여야 한다. */
function checkBracketedHost(hostname: string): void {
  if (hostname.startsWith("v") || hostname.startsWith("V")) {
    if (!IPV_FUTURE.test(hostname)) throw new UrlError("IPvFuture address is invalid");
  } else if (isIPv4(hostname)) {
    throw new UrlError("An IPv4 address cannot be in brackets");
  } else if (!isPythonIPv6(hostname)) {
    throw new UrlError(`'${hostname}' does not appear to be an IPv4 or IPv6 address`);
  }
}

/** 대괄호가 있는 netloc(_check_bracketed_netloc). 대괄호 앞에는 아무것도, 뒤에는 포트만 온다. */
function checkBracketedNetloc(netloc: string): void {
  const hostAndPort = netloc.slice(netloc.lastIndexOf("@") + 1);
  const open = hostAndPort.indexOf("[");
  if (open === -1) {
    const colon = hostAndPort.indexOf(":");
    checkBracketedHost(colon === -1 ? hostAndPort : hostAndPort.slice(0, colon));
    return;
  }
  if (open > 0) throw new UrlError("Invalid IPv6 URL");
  const bracketed = hostAndPort.slice(open + 1);
  const close = bracketed.indexOf("]");
  const port = close === -1 ? "" : bracketed.slice(close + 1);
  if (port !== "" && !port.startsWith(":")) throw new UrlError("Invalid IPv6 URL");
  checkBracketedHost(close === -1 ? bracketed : bracketed.slice(0, close));
}

/** NFKC 정규화로 구분자가 생기는 netloc(예: ℀가 a/c로 바뀐다)은 받지 않는다(_checknetloc). */
function checkNetloc(netloc: string): void {
  if (!NON_ASCII.test(netloc)) return;
  const bare = netloc.replace(/[@:#?]/g, "");
  const normalized = bare.normalize("NFKC");
  if (bare !== normalized && /[/?#@:]/.test(normalized)) {
    throw new UrlError(`netloc '${netloc}' contains invalid characters under NFKC normalization`);
  }
}

/** netloc의 끝(/, ?, # 가운데 가장 앞, 없으면 끝). */
function netlocEnd(url: string): number {
  const found = ["/", "?", "#"].map((char) => url.indexOf(char, 2)).filter((index) => index >= 0);
  return Math.min(url.length, ...found);
}

/** URL을 다섯 부분으로 나눈다(urllib.parse.urlsplit). 퍼센트 인코딩은 풀지 않는다. */
export function urlsplit(url: string): UrlParts {
  let rest = url.replace(LEADING_C0_OR_SPACE, "").replace(TAB_OR_NEWLINE, "");
  let scheme = "";
  let netloc = "";
  let query = "";
  let fragment = "";
  const colon = rest.indexOf(":");
  if (colon > 0 && SCHEME.test(rest.slice(0, colon))) {
    scheme = rest.slice(0, colon).toLowerCase();
    rest = rest.slice(colon + 1);
  }
  if (rest.startsWith("//")) {
    const end = netlocEnd(rest);
    netloc = rest.slice(2, end);
    rest = rest.slice(end);
    if (netloc.includes("[") !== netloc.includes("]")) throw new UrlError("Invalid IPv6 URL");
    if (netloc.includes("[")) checkBracketedNetloc(netloc);
  }
  const hash = rest.indexOf("#");
  if (hash !== -1) {
    fragment = rest.slice(hash + 1);
    rest = rest.slice(0, hash);
  }
  const mark = rest.indexOf("?");
  if (mark !== -1) {
    query = rest.slice(mark + 1);
    rest = rest.slice(0, mark);
  }
  checkNetloc(netloc);
  return { scheme, netloc, path: rest, query, fragment };
}

/** 다섯 부분을 URL로 잇는다(urllib.parse.urlunsplit). 빈 쿼리와 빈 조각은 ?와 #를 붙이지 않는다. */
export function urlunsplit(parts: UrlParts): string {
  const { scheme, path, query, fragment } = parts;
  const keepsSlashes =
    scheme !== "" && USES_NETLOC.has(scheme) && (path === "" || path.startsWith("/"));
  const netloc = parts.netloc !== "" || keepsSlashes ? parts.netloc : undefined;
  let url = path;
  if (netloc !== undefined) {
    if (url !== "" && !url.startsWith("/")) url = `/${url}`;
    url = `//${netloc}${url}`;
  } else if (url.startsWith("//")) {
    url = `//${url}`;
  }
  if (scheme !== "") url = `${scheme}:${url}`;
  if (query !== "") url = `${url}?${query}`;
  if (fragment !== "") url = `${url}#${fragment}`;
  return url;
}

/** http(s) 절대 주소인가: 스킴이 http나 https이고 netloc이 있다(FastAPI의 쿼리 형식 uri, _is_url). */
export function isHttpUrl(value: string): boolean {
  try {
    const { scheme, netloc } = urlsplit(value);
    return (scheme === "http" || scheme === "https") && netloc !== "";
  } catch (error) {
    if (error instanceof UrlError) return false;
    throw error;
  }
}

/** ASCII 구간의 %XX를 바이트로 풀어 UTF-8로 읽는다. 깨진 바이트는 U+FFFD다. */
function unquoteAscii(run: string): string {
  const bytes: number[] = [];
  for (let index = 0; index < run.length; index += 1) {
    const hex = run.slice(index + 1, index + 3);
    if (run[index] === "%" && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(Number.parseInt(hex, 16));
      index += 2;
    } else {
      bytes.push(run.charCodeAt(index));
    }
  }
  return UTF8.decode(Uint8Array.from(bytes));
}

/** +를 공백으로 바꾸고 퍼센트 인코딩을 푼다(urllib.parse.unquote_plus). ASCII 밖의 글자는 그대로 둔다. */
export function unquotePlus(text: string): string {
  const spaced = text.replaceAll("+", " ");
  return spaced.includes("%") ? spaced.replace(ASCII_RUN, unquoteAscii) : spaced;
}

/** 쿼리 문자열의 (이름, 값) 목록(urllib.parse.parse_qsl). 값이 빈 항목과 =가 없는 항목은 버린다. */
export function parseQsl(query: string): [string, string][] {
  const pairs: [string, string][] = [];
  for (const field of query.split("&")) {
    const equals = field.indexOf("=");
    if (equals === -1 || equals === field.length - 1) continue;
    pairs.push([unquotePlus(field.slice(0, equals)), unquotePlus(field.slice(equals + 1))]);
  }
  return pairs;
}

/**
 * 퍼센트 인코딩(urllib.parse.quote). 영문자, 숫자, _.-~와 safe의 글자만 그대로 두고, 나머지는 UTF-8
 * 바이트마다 %XX(대문자)로 쓴다.
 */
export function quote(text: string, safe = "/"): string {
  let quoted = "";
  for (const byte of Buffer.from(text, "utf8")) {
    const char = String.fromCharCode(byte);
    const plain = byte < 0x80 && (ALWAYS_SAFE.includes(char) || safe.includes(char));
    quoted += plain ? char : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return quoted;
}

/** 폼 인코딩(urllib.parse.quote_plus): 공백은 +, /도 인코딩한다. */
export function quotePlus(text: string): string {
  return text.includes(" ") ? quote(text, " ").replaceAll(" ", "+") : quote(text, "");
}

/** (이름, 값) 목록을 쿼리 문자열로(urllib.parse.urlencode). 순서를 지킨다. */
export function urlencode(pairs: Iterable<readonly [string, string]>): string {
  return Array.from(pairs, ([name, value]) => `${quotePlus(name)}=${quotePlus(value)}`).join("&");
}

/**
 * 주소의 쿼리 뒤에 파라미터를 붙인다(FastAPI의 _with_query). 원래 쿼리는 parseQsl로 읽어 다시
 * 인코딩하므로 빈 값은 빠진다. 조각(#...)은 그대로 둔다.
 */
export function withQuery(url: string, params: Iterable<readonly [string, string]>): string {
  const parts = urlsplit(url);
  const query = urlencode([...parseQsl(parts.query), ...params]);
  return urlunsplit({ ...parts, query });
}
