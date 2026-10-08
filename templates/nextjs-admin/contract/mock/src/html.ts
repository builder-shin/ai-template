/**
 * 사람이 보는 화면(가짜 OAuth 서버의 로그인, 메일 보관함)의 HTML 도우미. 꾸밈 도구 없이 서버가 HTML
 * 한 장을 만들고, 스타일은 화면마다 짧게 인라인으로 둔다. 화면에 넣는 값은 모두 escapeHtml을 거친다.
 */

/** 텍스트를 HTML 본문과 속성 값에 그대로 넣을 수 있게 바꾼다. */
export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** 화면 한 장. 제목은 <title>과 <h1>에 함께 쓴다. style은 CSS, body는 이미 이스케이프한 HTML이다. */
export function htmlPage(title: string, style: string, body: string): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${style}
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${body}
</body>
</html>
`;
}
