import { readdirSync, readFileSync, lstatSync, existsSync } from "node:fs";
import { join } from "node:path";
import { nativeProjectPath } from "./owned.mjs";
import { redactNative } from "./redact.mjs";
import { nativeFlows } from "./flows.mjs";
export function pickerHierarchy(raw) {
  const nodes = [],
    labels = new Set(["Photos", "Albums", "Dismiss", "Cancel", "No image selected."]);
  function label(value) {
    if (!value) return undefined;
    if (/^Photo taken on /.test(value)) return "Photo available";
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
