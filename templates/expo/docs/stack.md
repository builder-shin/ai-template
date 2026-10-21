# Verified stack

SDK 58.0.16 / React 19.3.0 / React Native 0.88.0 / TypeScript 6.0.3. All direct dependencies are exact pins and the independent workspace retains minimumReleaseAge 1440, explicit allowBuilds and the TypeScript override. Native modules follow Expo 58.0.16's bundledNativeModules.json. No existing template pins are changed.

CI runs `expo install --check` with step-scoped `EXPO_OFFLINE=1` against the installed SDK's bundled compatibility matrix. A real CLI regression verifies that an incompatible React Native version fails. The separate online `expo-doctor` step runs its other 19 checks with `EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK=1`; the version check is supplied by the preceding matrix validation. Review new SDK recommendations by running both commands without these environment flags, then deliberately update pins after their release age is satisfied. This keeps a newly published remote patch recommendation from changing the meaning of a frozen SDK build.

Generated API/mobile compositions keep these checks in the root `mobile-check` job, with independent frozen root/mobile installs and both Metro exports. Their `mobile-android` and `mobile-ios` jobs provide native device and release-build verification.

- [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/) and [Router](https://docs.expo.dev/router/introduction/).
- [SecureStore](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/), [AuthSession](https://docs.expo.dev/versions/v58.0.0/sdk/auth-session/), [ImagePicker](https://docs.expo.dev/versions/v58.0.0/sdk/imagepicker/).
- [Jest/React Native testing](https://docs.expo.dev/develop/unit-testing/): jest-expo 58.0.11, Jest 30.5.2, RNTL 14.1.0 and test-renderer 1.3.0.
- Vitest 5.0.1 runs the copied contract/mock workspace's tests. It is an explicit development dependency so standalone projects never resolve a parent repository's test tools.
- [Maestro](https://docs.maestro.dev/): CLI 2.11.0, Java 21. Native flows require development builds and actual platform runtimes.
- expo-system-ui 58.0.6 follows the SDK's bundled range and applies the system theme in native builds. [Native testing](recipes/native-testing.md) documents checked tools, isolated Windows installation and platform CI.

Compatibility decisions: eslint-config-expo 58.0.4 brings plugins whose peer ranges exclude ESLint 10; this template uses a local TypeScript/boundaries configuration with the repository's ESLint 10.11.0 pin. react-dom 19.3.0 is pinned as development peer infrastructure for the Router graph; there is no web app/export. The contract's existing TypeSpec 1.16.0 graph retains asset-emitter 0.79.2; newer transitive 0.79.3 requires compiler 1.17 and is incompatible.

One upstream peer advisory remains, also present in the existing web graph: boundaries → eslint-module-utils → resolver-typescript auto-resolves eslint-plugin-import 2.32.0, whose metadata stops at ESLint 9. This plugin's rules are not enabled. The active boundaries policies and the full lint command run under ESLint 10; the warning is recorded without a forced upgrade or a broad peer-policy suppression.
