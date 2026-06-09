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
