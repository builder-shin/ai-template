# Expo mobile template

Native iOS and Android app sharing the platform JSON:API contract.

```text
pnpm setup
pnpm dev
pnpm check
pnpm export --platform android
pnpm build --platform android --configuration debug
pnpm test:e2e --platform android --device <owned-device-id>
```

Use a development build for authentication. See [authentication](docs/recipes/authentication.md), [images and profile](docs/recipes/uploads.md), [development](docs/recipes/development.md), [stack](docs/stack.md), and [AGENTS.md](AGENTS.md). Native builds need the platform SDK; an exported JS bundle does not prove a native build or device flow.

[Native testing](docs/recipes/native-testing.md) covers checked Maestro/Java tools, Windows CNG isolation, release HTTPS settings, seven device flows and standalone/composed CI.
