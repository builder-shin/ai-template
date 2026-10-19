import { spawnSync } from "node:child_process";

// 외부 명령은 전부 셸 함수로 대체하며 빈 PATH로 실제 인프라 접근을 막는다.
export function runNestCiShell(script: string, owner = "/workspace/templates/nestjs") {
  const sandbox = `
set -eu
PATH=
RUNNER_TEMP=/ci
GITHUB_RUN_ID=17
GITHUB_RUN_ATTEMPT=2
ci_cwd=/workspace
stack_owner='${owner}'
image_live=1
generated=1
docker() {
  if [ "$1" = rm ]; then
    [ "$2" = -f ] && [ "$3" = aitpl-nestjs-image-17-2 ] || return 91
    image_live=0
    printf '이미지 probe 제거\\n'
  elif [ "$1" = compose ]; then
    shift
    [ "$1" = -p ] && [ "$2" = nestjs ] || return 92
    shift 2
    [ "$1" = -f ] && [ "$2" = templates/nestjs/compose.yaml ] || return 93
    shift 2
    [ "$*" = "--profile app down -v" ] || return 94
    stack_owner=
    printf 'CI 스택 제거\\n'
  elif [ "$1" = image ] && [ "$2" = rm ]; then
    :
  else
    return 95
  fi
}
pnpm() {
  target="$ci_cwd"
  if [ "$1" = --dir ]; then target="/workspace/$2"; shift 2; fi
  case "$1" in
    install) ;;
    setup)
      if [ -n "$stack_owner" ] && [ "$stack_owner" != "$target" ]; then
        printf 'postgres 컨테이너가 이 프로젝트 소유가 아니다\\n' >&2
        return 42
      fi
      [ "$image_live" = 0 ] || { printf '이미지 probe가 남았다\\n' >&2; return 44; }
      stack_owner="$target"
      printf '사본 setup 완료:%s\\n' "$target"
      ;;
    gen:module) generated=0 ;;
    gen) generated=1 ;;
    check)
      [ "$2" = --fast ] || return 96
      [ "$generated" = 1 ] || { printf 'openapi.json이 선언과 다르다\\n' >&2; return 43; }
      printf '생성 계약 검사 완료\\n'
      ;;
    *) return 97 ;;
  esac
}
git() { :; }
tar() { :; }
mkdir() { :; }
rm() { :; }
cd() { ci_cwd="$1"; }
${script}
printf '최종 스택:%s\\n최종 probe:%s\\n' "$stack_owner" "$image_live"
`;
  const result = spawnSync("bash", ["--noprofile", "--norc", "-e", "-c", sandbox], {
    encoding: "buffer",
  });
  if (result.error) throw result.error;
  return {
    code: result.status,
    stdout: result.stdout.toString("utf8"),
    stderr: result.stderr.toString("utf8"),
  };
}
