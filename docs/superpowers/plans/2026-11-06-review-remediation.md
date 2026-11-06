# Review Remediation Implementation Plan

> **For agentic workers:** Use test-driven implementation and independent code review for each task. Track changing status in claude-mem work state.

**Goal:** Correct the three issues from the project review and open an assigned PR.

**Architecture:** Keep the existing authorization and realtime contracts. Apply the same target-permission rule to all role mutations. Treat user-wide revocation events as a prompt to verify the current mobile session. Diagnose the failed native locale flow from request and UI evidence before changing its behavior.

**Tech Stack:** Node 24.15.0, pnpm 12.6.0, NestJS, Expo, Vitest, Jest, Maestro.

**Spec:** The approved remediation request in this conversation; existing NestJS and Expo design specifications and AGENTS.md remain authoritative.

## Global Constraints

- Do not read .env files or edit generated files directly.
- Do not run local Docker stacks; backend integration and native iOS checks run in PR CI.
- Preserve locked dependencies, template independence, session generation fencing, and normal Git hooks.
- Use an English Conventional Commit without AI attribution and assign the PR to its author.

## Review Focus

- A limited role manager cannot delete a role carrying permissions outside their own grant scope.
- Deletion refusal leaves assignments, audit records, and events unchanged.
- Revoking another device leaves the current mobile session and private cache usable.
- A delayed or failed session check cannot clear a newer identity or cause a transient network logout.
- Locale-save E2E verifies an actual persisted language change and a visible native result.

## Task 1: Role deletion authorization

Files: `templates/nestjs/src/modules/roles/admin.service.ts`, its role tests, and `contract/conformance/test/flows/roles.test.ts` if needed.

1. Add and run a failing limited-actor deletion regression.
2. Apply the existing `canGrant` rule to the target role before side effects.
3. Verify allowed deletion and protected-role behavior and run the full non-Docker unit suite.

## Task 2: Mobile session revalidation

Files: `templates/expo/src/lib/realtime/connection.ts`, `provider.tsx`, and realtime tests.

1. Add failing tests for another session's event, actual current revocation, transient failure, duplicate events, and stale checks.
2. Revalidate the current session before ending it and preserve generation/cancellation safety.
3. Run targeted tests, the complete Jest suite, and the Expo check.

## Task 3: Native locale-save CI

Files: Expo profile, native runner, or `e2e/locale.yaml`, determined by evidence.

1. Inspect the failed iOS locale flow and corresponding API diagnostics.
2. Reproduce the underlying failure with a meaningful regression and make the smallest correction.
3. Verify locally supported checks and validate native iOS behavior in PR CI.

## Task 4: Review and publication

1. Run independent review and address material findings.
2. Run root `pnpm check`, mock conformance, affected template checks, and contract comparisons.
3. Commit with normal hooks, push the repair branch, and create an assigned PR with exact validation limits.
4. Inspect PR CI and resolve actionable failures.
