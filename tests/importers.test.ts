import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_IMPORT_BYTES } from "@/lib/limits";
import { convertImport } from "@/server/importers";
import { expectStatus } from "./helpers";

const sample = (name: string) =>
  new Uint8Array(fs.readFileSync(path.join(__dirname, "..", "samples", name)));
const text = (value: string) => new TextEncoder().encode(value);

describe("convertImport", () => {
  it("imports a .txt file as paragraphs and names it after the file", async () => {
    const result = await convertImport("meeting_notes.txt", sample("sample.txt"));
    expect(result.kind).toBe("txt");
    expect(result.title).toBe("meeting notes");
    expect(result.content).toContain("<p>Meeting notes</p>");
    // The sanitizer writes void tags in their self closing form.
    expect(result.content).toContain("imported as paragraphs.<br />Single line breaks");
    expect(result.content).toContain("&lt; and &amp;");
  });

  it("imports a .md file with its structure", async () => {
    const result = await convertImport("Launch checklist.md", sample("sample.md"));
    expect(result.kind).toBe("md");
    expect(result.title).toBe("Launch checklist");
    expect(result.content).toContain("<h1>Launch checklist</h1>");
    expect(result.content).toContain("<strong>Markdown</strong>");
    expect(result.content).toMatch(/<ul>\s*<li>Confirm the pilot team<\/li>/);
    expect(result.content).toMatch(/<ol>\s*<li>Draft the announcement<\/li>/);
    expect(result.content).toContain("<blockquote>");
  });

  it("imports a .docx file with headings, emphasis, underline and lists", async () => {
    const result = await convertImport("Quarterly plan.docx", sample("sample.docx"));
    expect(result.kind).toBe("docx");
    expect(result.title).toBe("Quarterly plan");
    expect(result.content).toContain("<h1>Quarterly plan</h1>");
    expect(result.content).toContain("<strong>bold</strong>");
    expect(result.content).toContain("<em>italic</em>");
    expect(result.content).toContain("<u>underlined</u>");
    expect(result.content).toMatch(/<ul><li>Ship the editor to the pilot team<\/li>/);
    expect(result.content).toMatch(/<ol><li>Agree on scope<\/li>/);
  });

  it("rejects unsupported file types with 415", async () => {
    await expectStatus(convertImport("report.pdf", text("%PDF-1.7")), 415);
    await expectStatus(convertImport("photo.png", text("fake")), 415);
    await expectStatus(convertImport("no-extension", text("hello")), 415);
  });

  it("rejects a file that only pretends to be a Word document", async () => {
    await expectStatus(convertImport("fake.docx", text("this is not a zip archive")), 415);
  });

  it("rejects a zip archive that is not a readable Word document", async () => {
    const zipHeaderOnly = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0]);
    await expectStatus(convertImport("broken.docx", zipHeaderOnly), 400);
  });

  it("rejects binary data in a text file", async () => {
    const binary = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x01, 0x02]);
    await expectStatus(convertImport("image.txt", binary), 415);
  });

  it("rejects empty and oversized files", async () => {
    await expectStatus(convertImport("empty.md", new Uint8Array()), 400);
    await expectStatus(convertImport("huge.txt", new Uint8Array(MAX_IMPORT_BYTES + 1).fill(97)), 413);
  });

  it("falls back to a default title when the file name has none", async () => {
    const result = await convertImport("___.md", text("# Hello"));
    expect(result.title).toBe("Imported document");
  });
});
