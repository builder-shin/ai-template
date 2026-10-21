# All template followups implementation plan

> **For agentic workers:** Implement the authorized handoff by independent ownership groups, with regression tests before behavior changes and a fresh final review.

**Goal:** Complete the actionable followups for web, admin, FastAPI and NestJS on Windows and verify the resulting PR.

**Architecture:** Preserve the canonical contract and existing independent template boundaries. Edit shared Next.js originals, then synchronize managed copies. BFF address forwarding will be opt-in, validate one ingress-provided IP, and construct backend forwarding headers without trusting caller-supplied chains.

**Tech Stack:** Existing pinned Node 24, pnpm 12.6.0, Next.js 16.3.8, React 19.3.0, FastAPI and NestJS.

**Spec:** Authorized handoff and BACKLOG at `C:/Users/rootj/.cache/orca-codex/all-template-followups-2026-10-21/`; canonical template specs remain authoritative.

## Global constraints

- Baseline `fd59ec6c4063eb80ff8aa9277f115490e584bfaf`; use `feature/all-template-followups` only.
- Do not read environment files, touch protected worktrees or use local Docker.
- Preserve exact dependency pins, minimumReleaseAge 1440, allowBuilds and TypeScript override.
- Source limit 400 lines; test limit 600 lines. No loading text or suppressed diagnostics.
- Generated contracts must come from their generators. Shared copies come from `pnpm sync`.
- Commit tracked template inputs before real generated-project smoke.
- Run each frontend's check/build/mock E2E sequentially. Real backend, Docker and images belong to PR CI.
- PR has an assignee, no AI attribution, no hook bypass or force push.

## Review focus

- Forged forwarding headers must not affect backend identity when disabled or untrusted.
- Concurrent refresh and relation searches must preserve request identity and newest-result behavior.
- Nullable values and permission failures must preserve user input and accessible control descriptions.
- Malformed generator/config/lock inputs must fail before writes or child execution.
- Process tests must own their fixtures and bound cleanup without deleting unknown data.

## Tasks

### 1. Admin resource UI and generator

Owner paths: admin resource components, declarations, resource generator and tests; admin auth locale normalization. Read descendant rules before edits.

- [x] Reproduce and fix T3-M1/M3/M4/M5/M6/M8, T3-RR1-M1/M2, T3-RR2-M1 and pending search supersession.
- [x] Complete T5-M1/M2, T6-M2/M3/RR1, T7-M3/M5/M6/M7, FW-M2/M3/M4.
- [x] Test real controls/Actions, deferred responses, relation 403, enum negative types and generator no-write failures.
- [x] Verify focused suites and admin types; return evidence for every ID.

### 2. Generation CLI, combo assets and backend E2E harness

Owner paths: `create/`, `scripts/src/web-e2e/`, `scripts/test/web-e2e/`.

- [x] Complete T2-I1, T8-M1/M2, T9-M1/M2/M3, T10-M1/M3/M4/M5, T11-M1/M2/M3/M4/M5.
- [x] Verify every frontend subset, stop-on-failure, malformed inputs, formatter ownership and app-specific diagnostics.
- [x] Complete relevant T12-M3 title fixes; preserve existing CLI behavior and committed-input boundary.
- [x] Run create and harness suites; document precise evidence and remaining CI-only checks.

### 3. NestJS contract and process/test hygiene

Owner paths: NestJS, root fixture cleanup tests, shared Next.js scripts and shared hook comment.

- [x] O1: failing real serialized global/strict HTTP assertions, nested retry metadata, integration expectations and current contract docs.
- [x] Q4/T1-M1/M2: deterministic Darwin release handshake and assertion diagnostics.
- [x] Register cleanup immediately for known fixture owners; use aitpl prefixes; preserve unknown temporary data.
- [x] T8-M3/RR1-M1 and T9-RR1-M1: process diagnostics tests, type-test separation and accurate comment.
- [x] Run NestJS unit/fast checks and focused process/root tests; explicitly retain native Darwin limitation.

### 4. Web diagnostics, safe return path and trusted BFF client address

Owner paths: web, shared session/API/environment/proxy infrastructure, shared documentation.

- [x] Q4: call-through diagnostic regression tests for auth input lifecycle and header logout, RTL act imports and JS-free flow coverage.
- [x] T4-RR1: strip repeated supported locale prefixes; preserve query/hash and existing redirect guards.
- [x] Q1: inspect installed Next request APIs and backend proxy trust boundaries; write concrete design and obtain independent security review.
- [x] Implement default-off ingress-header validation, request-scoped client factory, protected outbound headers and explicit proxy refresh context without breaking token single-flight.
- [x] Cover spoof/malformed/list/IPv4/IPv6/missing context/request isolation/auth/anonymous/refresh and both backend trust chains.
- [x] Reconcile T12-M3/M5 and current status docs without altering dated historical evidence.

### 5. Integration, review and PR

- [x] Synchronize shared originals and verify no generated drift or dependency changes.
- [x] Run root `pnpm check`, full normal frontend suites/check/build/mock E2E sequentially, NestJS local unit/fast gates and affected mock conformance.
- [x] Record every live backlog disposition with source/test evidence and explicit boundaries.
- [x] Commit reviewable groups through normal hooks; run real committed-input generation smoke outside the repository.
- [x] Request independent whole-branch review; address material findings with regressions.
- [ ] Push, create assigned PR and obtain all 15 exact-head CI jobs; resolve failures and refresh evidence.
- [ ] Report verified results and limitations in Korean; notify if a user-notification tool is available.
