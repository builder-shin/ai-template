import { readdirSync, readFileSync, lstatSync, existsSync } from "node:fs";
import { join } from "node:path";
import { nativeProjectPath } from "./owned.mjs";
import { redactNative, safeNativeReason } from "./redact.mjs";
import { nativeFlows } from "./flows.mjs";
import en from "../../src/lib/i18n/messages/en.json" with { type: "json" };
import ko from "../../src/lib/i18n/messages/ko.json" with { type: "json" };
export function pickerHierarchy(raw, secrets) {
  const nodes = [],
    labels = new Set([
      "Photos",
      "Albums",
      "Dismiss",
      "Cancel",
      "No image selected.",
      "Continue",
      "English",
      "한국어",
      "Allow",
      "Don't Allow",
      "OK",
      "Open",
      "Not Now",
      "Reload",
      "Go Home",
      "Home",
      "Safari",
      "Settings",
      "Expo Mobile",
      "Expo Template",
      "Get Started",
      "Get started",
      "Development servers",
      "Development builds",
      "Recently opened",
      "Enter URL",
      "Connect",
      "Connect to Server",
      "No development servers found",
      "Something went wrong",
      "Developer menu",
      "Uncaught Error",
      "Console Error",
      "Build Error",
      "Resolution Error",
      "Server Error",
      "Call Stack",
      "Component Stack",
      "Source",
      "Copy",
      "Dismiss error",
      "Dismiss all",
      "Minimize errors",
      "Reload JS",
      "Sitemap",
      "Unmatched Route",
      "Source code explorer",
      "Components",
    ]);
  for (const value of [...Object.values(en), ...Object.values(ko)])
    if (typeof value === "string") labels.add(value);
  const sdkModules = [
    "ExpoSecureStore",
    "ExpoCrypto",
    "ExpoLinking",
    "ExpoWebBrowser",
    "ExpoImagePicker",
    "ExpoFileSystem",
    "ExpoLocalization",
    "ExpoConstants",
    "ExponentConstants",
    "ExpoSystemUI",
    "ReanimatedModule",
    "RNWorklets",
    "RNCSafeAreaContext",
    "RNGestureHandlerModule",
    "PlatformConstants",
    "SourceCode",
  ];
  const publicFrames = [
    "src/app/_layout.tsx",
    "src/app/+native-intent.ts",
    "src/app/verify-email.tsx",
    "src/app/reset-password.tsx",
    "src/app/login.tsx",
    "src/app/oauth/callback.tsx",
    "src/features/auth/verify-screen.tsx",
    "src/features/auth/reset-screen.tsx",
    "src/features/auth/login-screen.tsx",
    "src/lib/providers.tsx",
    "src/lib/links/intent.ts",
    "src/lib/links/parse.ts",
    "src/lib/config/env.ts",
    "src/lib/config/runtime.ts",
    "src/lib/config/identity.ts",
    "src/lib/session/manager.ts",
    "src/lib/session/store.ts",
    "src/lib/session/transport.ts",
    "src/lib/session/context.tsx",
    "src/lib/session/protected-layout.tsx",
    "src/lib/api/client.ts",
    "src/lib/query/client.ts",
    "src/lib/api/session-client.ts",
    "src/lib/api/session-port.ts",
    "src/lib/links/pending.ts",
    "src/lib/links/oauth.ts",
    "src/lib/realtime/connection.ts",
  ];
  function label(value) {
    if (typeof value !== "string" || !value) return undefined;
    if (labels.has(value)) return value;
    const shortcut = /^(Dismiss|Reload|Copy|Extra Info)\s+\((?:ESC|[⌘⌥RC E]+)\)$/.exec(value);
    if (shortcut) return shortcut[1];
    const bareFrames = publicFrames.filter((path) => {
      const name = path.slice(path.lastIndexOf("/") + 1);
      if (name === "_layout.tsx") return false; // Nested Router layouts share this filename.
      const index = value.indexOf(name + ":");
      return index >= 0 && (index === 0 || /[\s,\\/]/.test(value[index - 1]));
    });
    const frame =
      publicFrames.find((path) => value.includes(path)) ??
      (bareFrames.length === 1 ? bareFrames[0] : undefined);
    if (frame) {
      const name = value.includes(frame) ? frame : frame.slice(frame.lastIndexOf("/") + 1);
      const line = Number(/^:(\d+)/.exec(value.slice(value.indexOf(name) + name.length))?.[1]);
      return `Source frame: ${frame}${line > 0 && line <= 400 ? `:${line}` : ""}`;
    }
    if (/^Photo taken on /.test(value)) return "Photo available";
    if (/^open(?: this (?:page|link))? in .+\?$/i.test(value)) return "External app confirmation";
    if (
      /cannot read (?:properties|property)|cannot convert (?:undefined|null)|undefined is not|is not a function/i.test(
        value,
      )
    )
      return "Runtime value error";
    if (/invalid hook call/i.test(value)) return "React hook usage error";
    if (/has not been registered/i.test(value)) return "Application registration error";
    if (/NativeEventEmitter.*(?:non-null|requires)/i.test(value))
      return "Native event emitter unavailable";
    if (/WorkletsError|ReanimatedError|\[(?:Worklets|Reanimated)\]/i.test(value))
      return "Worklets runtime error";
    if (/React Native version mismatch/i.test(value)) return "React Native version mismatch";
    if (/tried to register two views/i.test(value)) return "Native view registration conflict";
    if (/can't find variable|ReferenceError:/i.test(value)) return "Runtime reference error";
    if (/unable to resolve module|requiring unknown module/i.test(value))
      return "JavaScript module unavailable";
    if (/rendered (?:more|fewer) hooks|change in the order of hooks/i.test(value))
      return "React hook order error";
    if (/navigate before mounting|navigation context|no navigation object/i.test(value))
      return "Navigation initialization error";
    if (
      /cannot find native module|native module.*(?:null|not found)|TurboModuleRegistry.*(?:not found|could not be found)/i.test(
        value,
      )
    )
      return "Native module unavailable";
    if (
      /could not connect|unable to connect|cannot connect|connection refused|network request failed|failed to load|unable to load|could not load/i.test(
        value,
      )
    )
      return "Development server connection failure";
    if (/local network|find and connect to/i.test(value)) return "Local network permission";
    if (
      /unmatched route|doesn't exist|application error|uncaught error|render error|exception in hostfunction/i.test(
        value,
      )
    )
      return "Application error";
    if (/development servers|development build|expo go|connect to.*server|enter.*url/i.test(value))
      return "Development launcher";
    const symbol = [
      "registerRootComponent",
      "AppRegistry",
      "metroRequire",
      "loadModuleImplementation",
      "guardedLoadModule",
      "requireNativeModule",
      "getEnforcing",
      "installTurboModule",
      "NativeEventEmitter",
      "TurboModuleRegistry",
      "callFunctionReturnFlushedQueue",
      "runApplication",
      "AppContainer",
      "ExpoRoot",
      "ContextNavigator",
      "getDevServer",
      "setUpReactDevTools",
      "renderWithHooks",
    ].find((name) => new RegExp(`(?:^|\\W)${name}(?:\\W|$)`).test(value));
    if (symbol) return `SDK frame: ${symbol}`;
    const error = /\b(TypeError|SyntaxError|RangeError|Invariant Violation|Error):/.exec(value);
    if (error) return `Runtime ${error[1]} (unclassified)`;
    return "<other text>";
  }
  function visit(node) {
    if (nodes.length >= 120 || !node || typeof node !== "object") return;
    const a = node.attributes;
    if (a) {
      const modules = sdkModules.filter((name) =>
        new RegExp(`(?:^|\\W)${name}(?:\\W|$)`).test(
          `${a.text ?? ""} ${a.accessibilityText ?? ""}`,
        ),
      );
      nodes.push({
        class: /^[\w.$]+$/.test(a.class ?? "") ? a.class : undefined,
        bounds: /^\[\d+,\d+\]\[\d+,\d+\]$/.test(a.bounds ?? "") ? a.bounds : undefined,
        text: label(a.text),
        accessibility: label(a.accessibilityText),
        value: label(a.value),
        title: label(a.title),
        nativeError: nativeErrorReason(a),
        sdkModules: modules.length ? modules : undefined,
        resource: /^redbox-(?:error|dismiss|reload|copy|extra)$/.test(a["resource-id"] ?? "")
          ? a["resource-id"]
          : /^(?:button|field)-/.test(a["resource-id"] ?? "") &&
              labels.has(a["resource-id"].replace(/^(?:button|field)-/, ""))
            ? a["resource-id"]
            : undefined,
        clickable: a.clickable === "true",
        enabled: a.enabled === "true",
      });
    }
    if (Array.isArray(node.children)) for (const child of node.children) visit(child);
  }
  function nativeErrorReason(attributes) {
    if (attributes["resource-id"] !== "redbox-error" || !Array.isArray(secrets)) return undefined;
    const message =
      [attributes.value, attributes.title, attributes.text, attributes.accessibilityText]
        .filter((value) => typeof value === "string")
        .sort((left, right) => right.length - left.length)[0] ?? "";
    return safeNativeReason(message, secrets);
  }
  try {
    visit(JSON.parse(raw));
  } catch {
    return "Picker hierarchy unavailable.";
  }
  return `Picker hierarchy ${JSON.stringify(nodes)}`;
}
export function hierarchyDiagnostic(result, secrets) {
  if (result.code === 0) return pickerHierarchy(result.stdout ?? "", secrets);
  const stderr = String(result.stderr ?? ""),
    code = Number.isInteger(result.code) ? result.code : "unknown";
  const cause = /timeout|timed out|deadline/i.test(stderr)
    ? "driver timeout"
    : /unknown option|unrecognized option/i.test(stderr)
      ? "unsupported option"
      : /device|connect|socket|xctest|driver/i.test(stderr)
        ? "device/driver connection error"
        : "diagnostic command failed";
  return `Hierarchy unavailable (exit ${code}): ${cause}.`;
}
export function maestroFailureHierarchy(owned, flow, secrets) {
  nativeProjectPath(owned);
  if (flow !== "setup" && !nativeFlows.includes(flow))
    throw new Error("Unknown native diagnostic flow.");
  const root = join(owned.parent, "raw-maestro", flow),
    candidates = [];
  function visit(directory, inHierarchy = false) {
    const stat = lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const file = join(directory, entry.name),
        here = inHierarchy || entry.name === "screen-hierarchy";
      if (entry.isDirectory()) visit(file, here);
      else if (inHierarchy && entry.isFile() && entry.name.endsWith(".json")) {
        const info = lstatSync(file);
        if (info.size <= 2 * 1024 * 1024) candidates.push({ file, mtime: info.mtimeMs });
      }
    }
  }
  if (existsSync(root)) visit(root);
  const selected = candidates.sort((a, b) => b.mtime - a.mtime || b.file.localeCompare(a.file))[0];
  return selected ? pickerHierarchy(readFileSync(selected.file, "utf8"), secrets) : "";
}
export function maestroFailureLog(owned, flow, secrets) {
  nativeProjectPath(owned);
  if (flow !== "setup" && !nativeFlows.includes(flow))
    throw new Error("Unknown native diagnostic flow.");
  const root = join(owned.parent, "raw-maestro", flow);
  if (!existsSync(root)) return "";
  let output = "";
  for (const path of readdirSync(root, { recursive: true }).filter((path) =>
    path.endsWith(".log"),
  )) {
    const file = join(root, path),
      stat = lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 2 * 1024 * 1024) continue;
    output += redactNative(readFileSync(file, "utf8"), secrets) + "\n";
    if (output.length > 2 * 1024 * 1024) break;
  }
  return output;
}
export function maestroFailureDiagnostic(owned, flow, secrets) {
  if (!Array.isArray(secrets)) return "";
  const errors = maestroFailureLog(owned, flow, secrets)
    .split(/\r?\n/)
    .filter((line) => /\bERROR\b|\bCaused by:|\b[\w.$]*Exception\b/.test(line))
    .slice(-3);
  const reason = safeNativeReason(errors.join("\n"), secrets);
  return reason ? `Maestro failure detail: ${reason}` : "Maestro failure detail unavailable.";
}
