# Native authentication

`/login`, `/signup`, `/forgot-password`, `/verify-email` and `/reset-password` use the existing JSON:API contract. Mail links are validated by `+native-intent` before routing; the token stays in the current link/form and is never shown, cached in TanStack Query, or logged. An expired or used link offers a new mail request. See [app links](app-links.md) for associated-domain configuration.

Password login and Google/Kakao/Naver use the same session manager. Use a development build with the installed scheme in `app-identity.json`; Expo Go cannot establish this OAuth callback identity. Configure the backend's exact callback allowlist before using real providers. Provider setup and native iOS/Android execution remain separate verification gates from JS exports.

The refresh session is stored in a single SecureStore record; access tokens remain in memory. Protected routes wait for restoration. Offline restoration keeps the refresh record and offers retry. Revoked credentials, account changes and logout abort old work and clear the private query cache. Private keys begin with `sessionQueryKey(generation, locale)`; never cache auth grants, passwords, mail tokens or PKCE verifiers.

Call `await endSession(scope)` for every explicit sign-out path. It waits for both OAuth cancellation and session cleanup, even if one fails. The session screen confirms one/current, other, or all-session revocation. A current/all revocation clears local credentials before returning to sign-in.

Forms retain safe name/email fields on errors and clear submitted passwords. Error codes are validated against generated declarations, pointers map only to declared fields, and messages are translated when rendered. Both catalogs have identical keys and static typing. A restored account's locale is adopted only after validating `ko` or `en` and checking its session generation. Later profile changes persist the locale through `/me`.

`pnpm check` includes actual native controls, protected Router restoration, HTTP registration/verification/reset/session flows against an owned mock child, and cancellation/late-response tests. These tests use Node networking without substituting a fake API. They do not replace the separate native device E2E suite.
