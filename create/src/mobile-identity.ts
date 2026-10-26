export function nativeIdentity(name: string) {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name) || name.length > 50)
    throw new Error("Application name must be lower kebab-case, at most 50 characters.");
  const suffix = name.replaceAll("-", "_");
  const keywords = new Set(
    "abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null _ as fun in is object typealias typeof val var when".split(
      " ",
    ),
  );
  return {
    scheme: `aitpl-${name}`,
    iosBundleIdentifier: `com.example.${name}`,
    androidApplicationId: `com.example.${keywords.has(suffix) ? `app_${suffix}` : suffix}`,
  };
}
