export function nativeIdentity(name: string) {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name) || name.length > 50)
    throw new Error("Application name must be lower kebab-case, at most 50 characters.");
  return {
    scheme: `aitpl-${name}`,
    iosBundleIdentifier: `com.example.${name}`,
    androidApplicationId: `com.example.${name.replaceAll("-", "_")}`,
  };
}
