import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareNativeProject, cleanNativeProject } from "./native/owned.mjs";
import {
  maestroFailureLog,
  pickerHierarchy,
  maestroFailureHierarchy,
  hierarchyDiagnostic,
} from "./native/logs.mjs";

test("iOS native error shortcuts and SDK-only stack symbols survive diagnostic filtering", () => {
  const result = pickerHierarchy(
    JSON.stringify({
      children: [
        { attributes: { accessibilityText: "Dismiss\n(ESC)" } },
        { attributes: { accessibilityText: "Reload\n(⌘R)" } },
        { attributes: { accessibilityText: "Copy\n(⌥⌘C)" } },
        { attributes: { accessibilityText: "Extra Info\n(⌘E)" } },
        {
          attributes: {
            accessibilityText: "guardedLoadModule\n/private-person/private-project.js:12:1",
          },
        },
      ],
    }),
  );
  for (const label of ["Dismiss", "Reload", "Copy", "Extra Info", "SDK frame: guardedLoadModule"])
    assert.ok(result.includes(label), label);
  assert.doesNotMatch(result, /private-person|private-project|⌘|ESC/);
});

test("native fatal reasons expose fixed categories and known SDK modules without arbitrary message text", () => {
  const known = pickerHierarchy(
    JSON.stringify({
      attributes: {
        accessibilityText: "Cannot find native module 'ExpoCrypto' private-value",
      },
    }),
  );
  assert.match(known, /"sdkModules":\["ExpoCrypto"\]/);
  assert.doesNotMatch(known, /private-value/);
  const cases = [
    [
      "Invariant Violation: TurboModuleRegistry.getEnforcing(...): 'PrivateModule' could not be found. private-value",
      "Native module unavailable",
    ],
    [
      "Invariant Violation: main has not been registered. private-value",
      "Application registration error",
    ],
    [
      "new NativeEventEmitter() requires a non-null argument: private-value",
      "Native event emitter unavailable",
    ],
    [
      "WorkletsError: [Worklets] Mismatch between JavaScript part and native part private-value",
      "Worklets runtime error",
    ],
    ["TypeError: Cannot convert undefined value to object private-value", "Runtime value error"],
    ["ReferenceError: Can't find variable: private-value", "Runtime reference error"],
    ["Error: private-value", "Runtime Error (unclassified)"],
  ];
  for (const [message, expected] of cases) {
    const result = pickerHierarchy(JSON.stringify({ attributes: { accessibilityText: message } }));
    assert.ok(result.includes(expected), expected);
    assert.doesNotMatch(result, /private-value|PrivateModule/);
  }
});

test("external-app confirmations expose their kind without exposing the target name", () => {
  for (const prompt of ["Open this page in “Private project”?", "Open in “Private project”?"]) {
    const result = pickerHierarchy(
      JSON.stringify({
        attributes: { accessibilityText: "Expo Template" },
        children: [{ attributes: { text: prompt } }],
      }),
    );
    assert.match(result, /Expo Template/);
    assert.match(result, /External app confirmation/);
    assert.doesNotMatch(result, /Private project/);
  }
});

test("SDK error diagnostics preserve public source frames and controls without private screen values", () => {
  const result = pickerHierarchy(
    JSON.stringify({
      children: [
        { attributes: { text: "Uncaught Error" } },
        { attributes: { text: "Cannot read properties of undefined (reading 'private-value')" } },
        {
          attributes: {
            accessibilityText:
              "C:/Users/private-person/src/features/auth/verify-screen.tsx:12:8 private-value",
          },
        },
        { attributes: { "resource-id": "button-Verify email" } },
        {
          attributes: {
            "resource-id": "button-private@example.com",
            text: "src/private-project.tsx:2 private-value",
          },
        },
      ],
    }),
  );
  assert.match(result, /Uncaught Error/);
  assert.match(result, /Runtime value error/);
  assert.match(result, /Source frame: src\/features\/auth\/verify-screen\.tsx:12/);
  assert.match(result, /button-Verify email/);
  assert.doesNotMatch(result, /private-value|private-person|private-project|private@example/);
});

test("failure diagnostics use the paired stored hierarchy without reopening an iOS driver or exposing raw values", () => {
  const source = mkdtempSync(join(tmpdir(), "aitpl-saved-hierarchy-"));
  const owned = prepareNativeProject(source);
  try {
    const root = join(owned.parent, "raw-maestro/auth/screen-hierarchy");
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, "step-003-assert.json"),
      JSON.stringify({
        children: [
          { attributes: { accessibilityText: "Continue" } },
          { attributes: { text: "private@example.com" } },
        ],
      }),
    );
    const result = maestroFailureHierarchy(owned, "auth");
    assert.match(result, /Continue/);
    assert.doesNotMatch(result, /private@example/);
    assert.throws(() => maestroFailureHierarchy({ parent: source }, "auth"), /ownership/);
  } finally {
    cleanNativeProject(owned);
    rmSync(source, { recursive: true, force: true });
  }
});
test("stored hierarchy traversal never follows a linked artifact directory", () => {
  const source = mkdtempSync(join(tmpdir(), "aitpl-linked-hierarchy-"));
  const owned = prepareNativeProject(source);
  try {
    const outside = join(source, "outside"),
      root = join(owned.parent, "raw-maestro/auth");
    mkdirSync(outside);
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(outside, "screen.json"),
      JSON.stringify({ attributes: { text: "Continue" } }),
    );
    symlinkSync(
      outside,
      join(root, "screen-hierarchy"),
      process.platform === "win32" ? "junction" : "dir",
    );
    assert.equal(maestroFailureHierarchy(owned, "auth"), "");
  } finally {
    cleanNativeProject(owned);
    rmSync(source, { recursive: true, force: true });
  }
});
test("failed hierarchy startup reports a bounded redacted cause instead of hiding it", () => {
  const result = hierarchyDiagnostic({
    code: 130,
    stdout: "",
    stderr: "driver timeout https://example.com/?code=private-code password=private-password",
  });
  assert.match(result, /130/);
  assert.match(result, /driver timeout/);
  assert.doesNotMatch(result, /private-code|private-password|example.com/);
});

test("initial iOS diagnostics identify system controls and connection failures without echoing URLs", () => {
  const result = pickerHierarchy(
    JSON.stringify({
      children: [
        { attributes: { accessibilityText: "Continue" } },
        { attributes: { accessibilityText: "Don't Allow" } },
        { attributes: { text: "Retry" } },
        {
          attributes: {
            text: "Could not connect to development server https://private.example/?code=secret",
          },
        },
      ],
    }),
  );
  assert.match(result, /Continue/);
  assert.match(result, /Don't Allow/);
  assert.match(result, /Retry/);
  assert.match(result, /Development server connection failure/);
  assert.doesNotMatch(result, /private|secret|https/);
});

test("picker diagnostics retain system labels and structure without arbitrary screen content", () => {
  const result = pickerHierarchy(
    JSON.stringify({
      children: [
        { attributes: { text: "Dismiss", class: "android.widget.TextView", bounds: "[1,2][3,4]" } },
        {
          attributes: {
            accessibilityText: "Photo taken on Oct 21, 2026",
            class: "android.view.View",
          },
        },
        {
          attributes: {
            text: "private@example.com",
            accessibilityText: "private-code",
            class: "android.widget.EditText",
          },
        },
      ],
    }),
  );
  assert.match(result, /Dismiss/);
  assert.match(result, /Photo available/);
  assert.match(result, /android.widget.EditText/);
  assert.doesNotMatch(result, /private|Oct|2026/);
  assert.equal(pickerHierarchy("not json"), "Picker hierarchy unavailable.");
});
test("only redacted Maestro text diagnostics survive owned raw-trace cleanup", () => {
  const source = mkdtempSync(join(tmpdir(), "aitpl-maestro-log-test-"));
  let owned;
  try {
    owned = prepareNativeProject(source);
    const raw = join(owned.parent, "raw-maestro/auth");
    mkdirSync(raw, { recursive: true });
    writeFileSync(
      join(raw, "maestro.log"),
      'Launch failed: Activity not found\npassword="fixture-private-value" https://example.com/callback?code=opaque\n',
    );
    writeFileSync(join(raw, "commands.json"), "must not copy commands");
    const log = maestroFailureLog(owned, "auth", ["fixture-private-value"]);
    assert.match(log, /Activity not found/);
    assert.doesNotMatch(log, /fixture-private-value|opaque|commands|example.com/);
    assert.throws(() => maestroFailureLog({ parent: source }, "auth", []), /ownership/);
  } finally {
    if (owned) cleanNativeProject(owned);
    rmSync(source, { recursive: true, force: true });
  }
});
