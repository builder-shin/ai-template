import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

// PATH가 빈 셸과 공유 입력 FD로 응답·논리 시간을 모델링한다. 외부 서비스와 파일을 쓰지 않는다.
export function runImageHealthShell(
  script: string,
  responses: string[],
  owner: string,
  diagnosticsFail = false,
) {
  const sandbox = String.raw`
set -eu
PATH=
container='${owner}'
API_CONTAINER='${owner}'
exec 3<&0
clock=0
curl() {
  retry=0
  refused=0
  previous=
  for argument in "$@"; do
    [ "$previous" != --max-time ] || [ "$argument" = 2 ] || return 90
    [ "$argument" != --retry ] || retry=1
    [ "$argument" != --retry-connrefused ] || refused=1
    previous="$argument"
  done
  printf 'curl-args:%s\n' "$*" >&2
  while :; do
    IFS=: read -r result code <&3 || { result=56; code=000; }
    printf 'request:%s:%s\n' "$result" "$code" >&2
    if [ "$retry" = 1 ]; then
      case "$result:$code" in
        28:*|22:408|22:429|22:500|22:502|22:503|22:504) sleep 1; continue ;;
        7:*) if [ "$refused" = 1 ]; then sleep 1; continue; fi ;;
      esac
    fi
    printf '%s' "$code"
    return "$result"
  done
}
sleep() {
  [ "$1" = 1 ] || exit 91
  clock=$((clock + 1))
  printf 'delay:%s\n' "$clock" >&2
  [ "$clock" -lt 60 ] || exit 124
}
bash() {
  [ "$1" = -c ] || exit 92
  eval "$2"
}
timeout() (
  [ "$1" = 60s ] || exit 93
  shift
  "$@"
)
docker() {
  if [ "$1" = container ] && [ "$2" = inspect ]; then
    [ "$3" = --format ] && [ "$4" = '{{json .State}}' ] && [ "$5" = '${owner}' ] || return 94
    printf 'diagnostic-state:%s:{"Status":"exited","ExitCode":1}\n' "$5"
  elif [ "$1" = logs ] && [ "$2" = '${owner}' ]; then
    printf 'diagnostic-logs:%s\n' "$2"
  else
    return 95
  fi
  ${diagnosticsFail ? "return 96" : ":"}
}
${script}
printf 'probe-complete\n'
`;
  const utcStart = new Date().toISOString();
  const start = performance.now();
  const result = spawnSync("bash", ["--noprofile", "--norc", "-e", "-c", sandbox], {
    encoding: "buffer",
    input: Buffer.from(responses.join("\n") + "\n"),
    timeout: 5000,
  });
  console.info(
    "이미지 health 격리 셸 영수증",
    JSON.stringify({
      scriptSHA256: createHash("sha256").update(sandbox).digest("hex"),
      nativeChildPID: result.pid,
      utcStart,
      utcEnd: new Date().toISOString(),
      elapsedSeconds: (performance.now() - start) / 1000,
      nativeExit: result.status,
      signal: result.signal,
      stdoutBase64: result.stdout.toString("base64"),
      stderrBase64: result.stderr.toString("base64"),
      CPUSeconds: null,
      providerTokens: null,
      providerCurrency: null,
    }),
  );
  if (result.error) throw result.error;
  return {
    code: result.status,
    stdout: result.stdout.toString("utf8"),
    stderr: result.stderr.toString("utf8"),
  };
}
