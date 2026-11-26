import TurndownService from "turndown";

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  strongDelimiter: "**",
  hr: "---",
});

turndown.addRule("strikethrough", {
  filter: ["s", "del"],
  replacement: (content) => `~~${content}~~`,
});

/**
 * Stored document HTML to Markdown. Markdown has no underline, so underlined
 * text is exported as plain text. Everything else the editor supports has a
 * Markdown form.
 */
export function htmlToMarkdown(html: string): string {
  // The editor wraps list item text in a paragraph. Unwrap it so lists come
  // out tight, the way people write them by hand.
  const tight = html.replace(/<li>\s*<p>/g, "<li>").replace(/<\/p>\s*<\/li>/g, "</li>");
  const markdown = turndown
    .turndown(tight)
    .replace(/^(\s*(?:[-*+]|\d+\.))\s{2,}/gm, "$1 ")
    .trim();
  return markdown ? `${markdown}\n` : "";
}

/** The whole document as a Markdown file. The title becomes the top heading unless the text already starts with one. */
export function documentToMarkdown(title: string, html: string): string {
  const body = htmlToMarkdown(html);
  if (/^#\s/.test(body)) return body;
  return body ? `# ${title}\n\n${body}` : `# ${title}\n`;
}

/** A safe file name for the download, built from the document title. */
export function exportFilename(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase()
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
  return `${slug || "document"}.md`;
}
