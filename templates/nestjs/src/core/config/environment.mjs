/** 환경 전달은 설정 경계에서만 수행한다. 값은 출력하지 않는다. */
export function environment() {
  return { ...process.env };
}
