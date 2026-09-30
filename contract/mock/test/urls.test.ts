/**
 * URL 도구: Python 3.14의 urllib.parse(urlsplit, urlunsplit, parse_qsl, urlencode, quote)와 FastAPI의
 * _is_url, _with_query. 기대값은 Python 3.14.7로 낸 값이다(무작위 입력 13만 개로도 맞춰 봤다).
 */

import { describe, expect, it } from "vitest";
import {
  isHttpUrl,
  parseQsl,
  quote,
  quotePlus,
  unquotePlus,
  UrlError,
  urlencode,
  urlsplit,
  urlunsplit,
  withQuery,
} from "../src/core/urls.ts";

const LOCATION_SAFE = ":/%#?=@[]!$&'()*+,;";

describe("urlsplit", () => {
  it.each([
    ["http://u:p@h:1/p;q?r#s", ["http", "u:p@h:1", "/p;q", "r", "s"]],
    ["HTTP://X", ["http", "X", "", "", ""]],
    [" \x00http://x/a\tb\nc", ["http", "x", "/abc", "", ""]],
    ["http://h?x", ["http", "h", "", "x", ""]],
    ["http://h#f?g", ["http", "h", "", "", "f?g"]],
    ["http:///path", ["http", "", "/path", "", ""]],
    ["localhost:3000/cb", ["localhost", "", "3000/cb", "", ""]],
    ["1http://x", ["", "", "1http://x", "", ""]],
    ["//host/path", ["", "host", "/path", "", ""]],
    ["http://[::1]:3000/cb", ["http", "[::1]:3000", "/cb", "", ""]],
    ["http://[fe80::1%eth0]/", ["http", "[fe80::1%eth0]", "/", "", ""]],
    ["http://[v1.x]/", ["http", "[v1.x]", "/", "", ""]],
  ])("%j", (url, parts) => {
    const { scheme, netloc, path, query, fragment } = urlsplit(url);
    expect([scheme, netloc, path, query, fragment]).toEqual(parts);
  });

  it.each([
    "http://[::1",
    "http://::1]/",
    "http://[1.2.3.4]/",
    "http://[vg.x]/",
    "http://[fe80::1%]/",
    "http://[::1]x/",
    "http://[::1]@a/", // betterleaks:allow 자격 증명이 아니라 사용자 정보 자리의 대괄호 호스트다
    "http://[1::2::3]/",
    "http://ex\u2100ample.com/",
  ])("%j는 Python이 ValueError를 던지는 URL이다", (url) => {
    expect(() => urlsplit(url)).toThrow(UrlError);
  });

  it("urlunsplit은 빈 쿼리와 조각에 ?와 #를 붙이지 않고, 경로 앞에 /를 넣는다", () => {
    const parts = { scheme: "http", netloc: "h", path: "p", query: "", fragment: "" };
    expect(urlunsplit(parts)).toBe("http://h/p");
    expect(urlunsplit({ ...parts, netloc: "", path: "/p" })).toBe("http:///p");
    expect(urlunsplit({ ...parts, scheme: "mailto", netloc: "", path: "a@b" })).toBe("mailto:a@b");
    expect(urlunsplit({ ...parts, query: "q", fragment: "f" })).toBe("http://h/p?q#f");
  });
});

describe("isHttpUrl(FastAPI의 쿼리 형식 uri)", () => {
  it.each([
    ["http://localhost:3000/oauth/callback", true],
    ["HTTPS://A.B", true],
    ["\thttp://x", true],
    ["ht\ttp://x", true],
    ["http:x", false],
    ["http://", false],
    ["http:///path", false],
    ["ftp://x", false],
    ["localhost:3000", false],
    ["http://[::1", false],
    ["http://[::ffff:1.2.3.4]/", true],
    ["http://[1:2:3:4:5:6:7:8:9]/", false],
    ["http://exa mple.com", true],
  ])("%j → %s", (url, expected) => {
    expect(isHttpUrl(url)).toBe(expected);
  });
});

describe("쿼리", () => {
  it("parseQsl은 빈 값과 =가 없는 항목을 버리고 +와 %XX를 푼다", () => {
    expect(parseQsl("x=1&y=&z&=v&a=b+c%2Bd&e=%E2%82%AC&f=%E2%82&%ZZ=1")).toEqual([
      ["x", "1"],
      ["", "v"],
      ["a", "b c+d"],
      ["e", "€"],
      ["f", "\ufffd"],
      ["%ZZ", "1"],
    ]);
  });

  it("unquotePlus는 깨진 UTF-8을 U+FFFD로 읽고, BOM과 ASCII 밖의 글자는 그대로 둔다", () => {
    expect(unquotePlus("%C3é%ef%bb%bfA%F0%9F%98%80%ED%A0%80")).toBe(
      "\ufffdé\ufeffA😀\ufffd\ufffd\ufffd",
    );
  });

  it("urlencode는 quote_plus로 쓴다: 공백은 +, 영문자·숫자·_.-~ 밖은 %XX", () => {
    expect(
      urlencode([
        ["a b", "c/d"],
        ["~*", "é"],
        ["", ""],
      ]),
    ).toBe("a+b=c%2Fd&~%2A=%C3%A9&=");
    expect(quotePlus("x y/z")).toBe("x+y%2Fz");
  });

  it("quote는 safe의 글자를 두고 나머지를 UTF-8 바이트마다 %XX로 쓴다(Starlette의 Location)", () => {
    expect(quote("http://h/c b?x=ü&y=a+b%20c", LOCATION_SAFE)).toBe(
      "http://h/c%20b?x=%C3%BC&y=a+b%20c",
    );
    expect(quote('"<>`{|}^\\', LOCATION_SAFE)).toBe("%22%3C%3E%60%7B%7C%7D%5E%5C");
    expect(quote("a/b c")).toBe("a/b%20c");
  });

  it("withQuery는 원래 쿼리를 다시 인코딩해 파라미터를 붙이고 조각을 지킨다(FastAPI의 _with_query)", () => {
    const code = [["code", "abc"]] as const;
    expect(withQuery("http://localhost:3000/oauth/callback", code)).toBe(
      "http://localhost:3000/oauth/callback?code=abc",
    );
    expect(withQuery("http://localhost:3000", code)).toBe("http://localhost:3000?code=abc");
    expect(withQuery("HTTP://Host/cb?x=1&y=&z#frag", code)).toBe(
      "http://Host/cb?x=1&code=abc#frag",
    );
    expect(withQuery("http://h/cb?a=%7e%20b", [["state", "a b/c~d*e'(!)"]])).toBe(
      "http://h/cb?a=~+b&state=a+b%2Fc~d%2Ae%27%28%21%29",
    );
  });
});
