import { describe, expect, it } from "vitest";
import { documentToMarkdown, exportFilename, htmlToMarkdown } from "@/server/export";

describe("htmlToMarkdown", () => {
  it("converts the formatting the editor supports", () => {
    const html =
      "<h1>Plan</h1><p>Some <strong>bold</strong>, <em>italic</em> and <s>old</s> text.</p>" +
      "<ul><li><p>one</p></li><li><p>two</p></li></ul>" +
      "<ol><li><p>first</p></li><li><p>second</p></li></ol>" +
      "<blockquote><p>quoted</p></blockquote><h2>Next</h2>" +
      '<p><a href="https://example.com">a link</a></p>';
    expect(htmlToMarkdown(html)).toBe(
      [
        "# Plan",
        "",
        "Some **bold**, *italic* and ~~old~~ text.",
        "",
        "- one",
        "- two",
        "",
        "1. first",
        "2. second",
        "",
        "> quoted",
        "",
        "## Next",
        "",
        "[a link](https://example.com)",
        "",
      ].join("\n"),
    );
  });

  it("keeps underlined text as plain text, because Markdown has no underline", () => {
    expect(htmlToMarkdown("<p>very <u>important</u> note</p>")).toBe("very important note\n");
  });

  it("returns an empty string for an empty document", () => {
    expect(htmlToMarkdown("<p></p>")).toBe("");
  });
});

describe("documentToMarkdown", () => {
  it("adds the title as the top heading when the text has none", () => {
    expect(documentToMarkdown("Meeting notes", "<p>Hello</p>")).toBe("# Meeting notes\n\nHello\n");
    expect(documentToMarkdown("Empty", "<p></p>")).toBe("# Empty\n");
  });

  it("does not repeat a top heading the text already has", () => {
    expect(documentToMarkdown("Plan", "<h1>Launch plan</h1><p>Go</p>")).toBe("# Launch plan\n\nGo\n");
  });
});

describe("exportFilename", () => {
  it("builds a safe file name from the title", () => {
    expect(exportFilename("Q3 Roadmap: Draft #2")).toBe("q3-roadmap-draft-2.md");
    expect(exportFilename('  ../../etc/passwd "x"  ')).toBe("etcpasswd-x.md");
    expect(exportFilename("???")).toBe("document.md");
  });
});
