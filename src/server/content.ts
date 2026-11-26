import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { DEFAULT_TITLE, MAX_CONTENT_CHARS, MAX_TITLE_LENGTH } from "@/lib/limits";
import { payloadTooLarge } from "./errors";

export const EMPTY_DOCUMENT = "<p></p>";

// Exactly the elements the editor can render. Anything else is dropped and
// its text is kept. The only attribute that survives is href on links.
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "h1", "h2", "h3", "strong", "em", "u", "s", "code", "pre",
    "blockquote", "ul", "ol", "li", "hr", "a",
  ],
  allowedAttributes: { a: ["href"] },
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false,
  transformTags: { b: "strong", i: "em", strike: "s", del: "s", h4: "h3", h5: "h3", h6: "h3" },
};

/**
 * Runs on every write, for typed content and for imports alike. Stored HTML
 * can therefore be trusted wherever it is read back.
 */
export function sanitizeContent(html: string): string {
  if (html.length > MAX_CONTENT_CHARS) {
    throw payloadTooLarge(
      `This document is too large to save. The limit is ${MAX_CONTENT_CHARS.toLocaleString("en-US")} characters.`,
    );
  }
  const clean = sanitizeHtml(html, SANITIZE_OPTIONS).trim();
  return clean || EMPTY_DOCUMENT;
}

export function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_LENGTH);
}

export function titleOrDefault(title: string | undefined | null): string {
  return normalizeTitle(title ?? "") || DEFAULT_TITLE;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Blank lines separate paragraphs. Single line breaks are kept. */
export function plainTextToHtml(text: string): string {
  const normalized = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) return EMPTY_DOCUMENT;
  return normalized
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function markdownToHtml(markdown: string): string {
  const html = marked.parse(markdown.replace(/^﻿/, ""), { async: false, gfm: true });
  return sanitizeContent(html);
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

/** Short plain text preview of a document for the dashboard. */
export function toSnippet(html: string, maxLength = 140): string {
  const spaced = html.replace(/<\/(p|h[1-3]|li|blockquote|pre)>|<br\s*\/?>/gi, " ");
  const text = sanitizeHtml(spaced, { allowedTags: [], allowedAttributes: {} })
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}
