import { describe, expect, it } from "vitest";
import { MAX_CONTENT_CHARS } from "@/lib/limits";
import {
  EMPTY_DOCUMENT,
  markdownToHtml,
  normalizeTitle,
  plainTextToHtml,
  sanitizeContent,
  toSnippet,
} from "@/server/content";

describe("sanitizeContent", () => {
  it("keeps the formatting the editor supports", () => {
    const html =
      "<h1>Title</h1><p><strong>bold</strong> <em>italic</em> <u>under</u> <s>gone</s></p>" +
      "<ul><li><p>one</p></li></ul><ol><li><p>two</p></li></ol><blockquote><p>quote</p></blockquote>";
    expect(sanitizeContent(html)).toBe(html);
  });

  it("removes scripts, event handlers and inline styles", () => {
    const dirty =
      '<p onclick="steal()" style="color:red">Hello</p><script>alert(1)</script><img src=x onerror=alert(1)>';
    expect(sanitizeContent(dirty)).toBe("<p>Hello</p>");
  });

  it("drops links with unsafe schemes and keeps normal ones", () => {
    const out = sanitizeContent(
      '<p><a href="javascript:alert(1)">bad</a> <a href="https://example.com" onclick="x()">good</a></p>',
    );
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("onclick");
    expect(out).toContain('<a href="https://example.com">good</a>');
  });

  it("maps older tags onto the supported ones", () => {
    expect(sanitizeContent("<p><b>a</b><i>b</i></p><h5>small</h5>")).toBe(
      "<p><strong>a</strong><em>b</em></p><h3>small</h3>",
    );
  });

  it("returns an empty paragraph for empty input", () => {
    expect(sanitizeContent("")).toBe(EMPTY_DOCUMENT);
    expect(sanitizeContent("   ")).toBe(EMPTY_DOCUMENT);
    expect(sanitizeContent("<script>alert(1)</script>")).toBe(EMPTY_DOCUMENT);
  });

  it("rejects content above the size limit with 413", () => {
    expect(() => sanitizeContent("a".repeat(MAX_CONTENT_CHARS + 1))).toThrowError(
      expect.objectContaining({ status: 413 }),
    );
  });
});

describe("plainTextToHtml", () => {
  it("turns blank lines into paragraphs and keeps single line breaks", () => {
    expect(plainTextToHtml("first line\nsecond line\n\nnext paragraph")).toBe(
      "<p>first line<br>second line</p><p>next paragraph</p>",
    );
  });

  it("escapes markup so text files cannot inject HTML", () => {
    expect(plainTextToHtml("<script>alert(1)</script> & more")).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; more</p>",
    );
  });

  it("handles Windows line endings and a byte order mark", () => {
    expect(plainTextToHtml("﻿one\r\n\r\ntwo")).toBe("<p>one</p><p>two</p>");
  });
});

describe("markdownToHtml", () => {
  it("converts headings, emphasis and lists", () => {
    const html = markdownToHtml("# Plan\n\nSome **bold** and *italic* text.\n\n- one\n- two\n\n1. first\n2. second");
    expect(html).toContain("<h1>Plan</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toMatch(/<ul>\s*<li>one<\/li>/);
    expect(html).toMatch(/<ol>\s*<li>first<\/li>/);
  });

  it("strips raw HTML that Markdown would otherwise pass through", () => {
    const html = markdownToHtml('Hello <script>alert(1)</script><img src="x" onerror="alert(1)"> world');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("Hello");
  });
});

describe("helpers", () => {
  it("normalizes titles", () => {
    expect(normalizeTitle("  Quarterly \n  plan  ")).toBe("Quarterly plan");
    expect(normalizeTitle("x".repeat(500))).toHaveLength(120);
  });

  it("builds a plain text snippet", () => {
    expect(toSnippet("<h1>Title</h1><p>Tom &amp; Jerry</p><ul><li><p>one</p></li></ul>")).toBe(
      "Title Tom & Jerry one",
    );
    expect(toSnippet(`<p>${"word ".repeat(100)}</p>`, 20).length).toBeLessThanOrEqual(20);
  });
});
