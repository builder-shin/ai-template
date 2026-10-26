# Native development

Use Node 24 and pnpm 12.6.0. `pnpm setup` installs the frozen graph without starting infrastructure or changing a parent Git repository. Commands disable implicit dotenv loading; inject the five documented public variables into the process explicitly. `.env.example` contains public examples and is never loaded as credentials.

`pnpm dev` defaults to Android; `pnpm dev --platform ios` chooses iOS simulator endpoints. The runner checks ports then owns its Metro (8081) and mock (4012), advertising the selected API origin for storage and provider links too. `EXPO_PUBLIC_API_MODE=backend` uses an already prepared API and starts Metro only. Stop with Ctrl+C; only the child process trees it created are stopped.

An Android emulator reaches the host through `10.0.2.2`; an iOS simulator uses `localhost`. A physical device needs an explicit LAN API and realtime URL. Storage's presigned host must also be reachable. Configure the server's public storage origin; never replace a signed host on the client.

Use a development build, not Expo Go, for private schemes/OAuth/SecureStore. Android compilation requires Java 21 and Android SDK 37; iOS compilation requires macOS and Xcode 26.4+. E2E uses Metro 8082/mock 4112 and an explicitly selected owned device. Release configuration requires HTTPS URLs. Cloud accounts and store publication are not required.

React Native's Android WebSocket sends the realtime endpoint's HTTP(S) origin. Include that exact origin in the API's `REALTIME_ALLOWED_ORIGINS`; retain selected web origins too. The standalone mock runner does this explicitly. See [native testing](native-testing.md) for complete build/device/CI commands and cleanup rules.
