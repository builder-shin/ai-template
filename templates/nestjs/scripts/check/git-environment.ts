const repositorySelectors = new Set([
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_COMMON_DIR",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_NAMESPACE",
  "GIT_PREFIX",
]);

export function gitEnvironment(
  // eslint-disable-next-line aitpl/no-direct-env -- Git 하위 프로세스의 환경을 보존하고 저장소 지정 변수만 제거한다
  inherited: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return Object.fromEntries<string | undefined>(
    Object.entries(inherited).filter(([key]) => !repositorySelectors.has(key)),
  );
}
