const repositoryVariables = new Set([
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_COMMON_DIR",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_NAMESPACE",
  "GIT_PREFIX",
]);

/** cwd로 고른 저장소가 hook의 저장소 선택 환경에 가려지지 않게 한다. */
export function gitEnvironment(environment: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...environment };
  for (const key of repositoryVariables) Reflect.deleteProperty(env, key);
  return env;
}
