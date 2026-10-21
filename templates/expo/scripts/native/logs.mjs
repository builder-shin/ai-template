import { readdirSync, readFileSync, lstatSync, existsSync } from "node:fs";
import { join } from "node:path";
import { nativeProjectPath } from "./owned.mjs";
import { redactNative } from "./redact.mjs";
import { nativeFlows } from "./flows.mjs";
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
    ]);
  function label(value) {
    if (!value) return undefined;
    if (/^Photo taken on /.test(value)) return "Photo available";
    if (
      /could not connect|unable to connect|cannot connect|connection refused|network request failed|failed to load|unable to load|could not load/i.test(
        value,
      )
    )
      return "Development server connection failure";
    if (/local network|find and connect to/i.test(value)) return "Local network permission";
    if (/unmatched route|doesn't exist|application error/i.test(value)) return "Application error";
    if (/development servers|development build|expo go|connect to.*server|enter.*url/i.test(value))
      return "Development launcher";
    return labels.has(value) ? value : "<other text>";
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
