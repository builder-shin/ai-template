/** 실행 스크립트의 자식 환경만 준비한다. 값은 출력하지 않는다. */
export function environment() {
  return { ...process.env };
}
