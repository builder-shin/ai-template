# Generated mobile backend E2E

`pnpm mobile-e2e fastapi|nestjs --platform android --device <owned-online-device> --run-id <id>` generates a real mobile-only combination from committed HEAD outside the repository. The generated mobile workspace, API context and native identity are used for the test. Commit template/combo input changes before running it.

The dedicated compose project is `ai-template-mobile-<backend>-e2e-<id>` and its exact image is `ai-template-mobile-e2e-<backend>:<id>`. API/storage/mail/provider ports are 18102/28435/28127/28182. The native runner owns loopback proxy 4112, bridge 4113, Metro 8082 and newly created ADB reverse mappings. The signed storage URL remains unchanged between device and host.

`--print` performs static validation and prints an explicit public plan without running Docker, generating projects or reading environment files. Before startup, compose structure/images/context/ports/mounts and existing containers/volumes are checked. Existing stacks, mounts, external volumes and env-file overrides are rejected. No development `fastapi`/`joon`/`nestjs` project is used.

Successful `--keep` retains the owned backend stack and generated project; native app/process/reverse cleanup still runs. `pnpm mobile-e2e <backend> --run-id <id> --down` cleans only that exact stack, its volumes and exact image. An ownership record in `node_modules/.cache/mobile-e2e` binds generated-project cleanup to its nonce marker and verified temporary parent. Cleanup does not follow links. Existing unrelated temporary folders are never adopted.

Real Docker execution runs in PR CI only. Both backend jobs execute the native flow suite against the generated API and actual dedicated storage/mail/provider services. Sanitized diagnostics appear only on failure; raw Maestro auth artifacts are discarded. See [native testing](../../../templates/expo/docs/recipes/native-testing.md) for tool prerequisites and release builds.
