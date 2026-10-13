import type { MailTemplates } from "./templates.js";
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
export function renderMail(
  templates: MailTemplates,
  values: Readonly<Record<string, string>>,
): MailTemplates {
  function render(text: string, html = false): string {
    return text.replace(/\{\{([^{}]+)\}\}/g, (_match: string, name: string) => {
      const value = Object.hasOwn(values, name) ? values[name] : undefined;
      if (value === undefined) throw new Error(`메일 값이 없다: ${name}`);
      return html ? escapeHtml(value) : value;
    });
  }
  return {
    subject: render(templates.subject),
    text: render(templates.text),
    html: render(templates.html, true),
  };
}
