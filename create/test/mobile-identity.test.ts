import { expect, it } from "vitest";
import { nativeIdentity } from "../src/mobile-identity.ts";
it.each(["class", "true", "null", "public", "int", "enum", "when", "object", "fun", "val", "_"])(
  "does not generate a Java keyword segment for %s",
  (name) => {
    if (name === "_") {
      expect(() => nativeIdentity(name)).toThrow();
      return;
    }
    expect(nativeIdentity(name).androidApplicationId).toBe(`com.example.app_${name}`);
  },
);
it("preserves the approved ordinary identity", () => {
  expect(nativeIdentity("my-app")).toEqual({
    scheme: "aitpl-my-app",
    iosBundleIdentifier: "com.example.my-app",
    androidApplicationId: "com.example.my_app",
  });
});
