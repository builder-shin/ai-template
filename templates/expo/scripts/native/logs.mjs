import { readdirSync, readFileSync, lstatSync, existsSync } from "node:fs";
import { join } from "node:path";
import { nativeProjectPath } from "./owned.mjs";
import { redactNative } from "./redact.mjs";
import { nativeFlows } from "./flows.mjs";
import en from "../../src/lib/i18n/messages/en.json" with { type: "json" };
import ko from "../../src/lib/i18n/messages/ko.json" with { type: "json" };
export function pickerHierarchy(raw) {
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
  ];
  function label(value) {
    if (typeof value !== "string" || !value) return undefined;
    if (labels.has(value)) return value;
    const frame = publicFrames.find((path) => value.includes(path));
    if (frame) {
      const line = Number(/^:(\d+)/.exec(value.slice(value.indexOf(frame) + frame.length))?.[1]);
      return `Source frame: ${frame}${line > 0 && line <= 400 ? `:${line}` : ""}`;
    }
    if (/^Photo taken on /.test(value)) return "Photo available";
    if (/^open(?: this (?:page|link))? in .+\?$/i.test(value)) return "External app confirmation";
    if (/cannot read (?:properties|property)|undefined is not|is not a function/i.test(value))
      return "Runtime value error";
    if (/rendered (?:more|fewer) hooks|change in the order of hooks/i.test(value))
      return "React hook order error";
    if (/navigate before mounting|navigation context|no navigation object/i.test(value))
      return "Navigation initialization error";
    if (/cannot find native module|native module.*(?:null|not found)/i.test(value))
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
    return "<other text>";
  }
  function visit(node) {
    if (nodes.length >= 120 || !node || typeof node !== "object") return;
    const a = node.attributes;
    if (a)
      nodes.push({
        class: /^[\w.$]+$/.test(a.class ?? "") ? a.class : undefined,
        bounds: /^\[\d+,\d+\]\[\d+,\d+\]$/.test(a.bounds ?? "") ? a.bounds : undefined,
        text: label(a.text),
        accessibility: label(a.accessibilityText),
        resource:
          /^(?:button|field)-/.test(a["resource-id"] ?? "") &&
          labels.has(a["resource-id"].replace(/^(?:button|field)-/, ""))
            ? a["resource-id"]
            : undefined,
        clickable: a.clickable === "true",
        enabled: a.enabled === "true",
      });
    if (Array.isArray(node.children)) for (const child of node.children) visit(child);
  }
  try {
    visit(JSON.parse(raw));
  } catch {
    return "Picker hierarchy unavailable.";
  }
  return `Picker hierarchy ${JSON.stringify(nodes)}`;
}
export function hierarchyDiagnostic(result) {
  if (result.code === 0) return pickerHierarchy(result.stdout ?? "");
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
export function maestroFailureHierarchy(owned, flow) {
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
  return selected ? pickerHierarchy(readFileSync(selected.file, "utf8")) : "";
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
