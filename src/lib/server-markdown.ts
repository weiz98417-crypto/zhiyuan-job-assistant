import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

marked.use({ gfm: true, breaks: false });

export function markdownToSafeHtml(markdown: string): string {
  const raw = marked.parse(markdown || "", { async: false }) as string;
  return sanitizeHtml(raw, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "h1", "h2", "h3", "h4", "h5", "h6", "table", "thead", "tbody", "tr", "th", "td",
    ]),
    allowedAttributes: {
      a: ["href", "name", "target"],
      th: ["align"],
      td: ["align"],
    },
  });
}

/** HTML 文本转义(四实体;spec 37 收口:export-file 两处标题/属性转义共用)。 */
export function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
