/** 실행 스크립트의 자식 환경만 준비한다. 값은 출력하지 않는다. */
export function environment(overrides = {}, source = process.env, platform = process.platform) {
  const env = { ...source };
  for (const [name, value] of Object.entries(overrides)) {
    for (const key of Object.keys(env)) {
      if (platform === "win32" ? key.toLowerCase() === name.toLowerCase() : key === name)
        Reflect.deleteProperty(env, key);
    }
    if (value !== undefined) env[name] = value;
  }
  return env;
}

export function environmentValue(name, source = process.env, platform = process.platform) {
  const key =
    platform === "win32"
      ? Object.keys(source).find((key) => key.toLowerCase() === name.toLowerCase())
      : name;
  return key === undefined ? undefined : source[key];
}
