/**
 * Hono 앱의 요청 문맥. 미들웨어가 요청마다 채우고 핸들러와 에러 처리가 읽는다.
 * 모듈이 문맥 변수를 더하면(예: 로그인한 사용자) 여기의 Variables에 더한다.
 */
export interface AppEnv {
  Variables: {
    /** 요청의 trace id(32자리 16진수). 에러 문서의 meta.traceId와 로그에 같은 값을 쓴다. */
    traceId: string;
  };
}
