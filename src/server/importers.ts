import path from "node:path";
import mammoth from "mammoth";
import { IMPORT_EXTENSIONS, IMPORT_HELP, MAX_IMPORT_BYTES } from "@/lib/limits";
import { markdownToHtml, normalizeTitle, plainTextToHtml, sanitizeContent } from "./content";
import { badRequest, payloadTooLarge, unsupportedMediaType } from "./errors";

export type ImportKind = "txt" | "md" | "docx";

export type ImportResult = {
  kind: ImportKind;
  title: string;
  /** Sanitized HTML, ready to store. */
  content: string;
};

function titleFromFilename(filename: string): string {
  const base = path.basename(filename, path.extname(filename)).replace(/[_]+/g, " ");
  return normalizeTitle(base) || "Imported document";
}

/** Every .docx file is a zip archive and starts with the bytes PK 03 04. */
function isZipArchive(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** Text files do not contain NUL bytes. Images, PDFs and archives do. */
function looksBinary(bytes: Uint8Array): boolean {
  const end = Math.min(bytes.byteLength, 8000);
  for (let i = 0; i < end; i += 1) if (bytes[i] === 0) return true;
  return false;
}

/**
 * Turns an uploaded file into a title and sanitized document content.
 * The file name decides the format and the bytes are checked against it, so a
 * renamed image or PDF is rejected instead of being stored as garbage.
 */
export async function convertImport(filename: string, bytes: Uint8Array): Promise<ImportResult> {
  const ext = path.extname(filename).toLowerCase();
  if (!(IMPORT_EXTENSIONS as readonly string[]).includes(ext)) {
    const label = ext ? `${ext} files are` : "This file type is";
    throw unsupportedMediaType(`${label} not supported. ${IMPORT_HELP}`);
  }
  if (bytes.byteLength === 0) throw badRequest("This file is empty.");
  if (bytes.byteLength > MAX_IMPORT_BYTES) {
    throw payloadTooLarge(`This file is too large. ${IMPORT_HELP}`);
  }

  const title = titleFromFilename(filename);

  if (ext === ".docx") {
    if (!isZipArchive(bytes)) {
      throw unsupportedMediaType("This file has a .docx name but is not a Word document.");
    }
    let html: string;
    try {
      const result = await mammoth.convertToHtml(
        { buffer: Buffer.from(bytes) },
        { styleMap: ["u => u"] }, // mammoth drops underline unless asked to keep it
      );
      html = result.value;
    } catch {
      throw badRequest("This Word file could not be read. It may be damaged or password protected.");
    }
    return { kind: "docx", title, content: sanitizeContent(html) };
  }

  if (looksBinary(bytes)) {
    throw unsupportedMediaType(`This file does not contain plain text. ${IMPORT_HELP}`);
  }
  const text = new TextDecoder("utf-8").decode(bytes);
  if (ext === ".txt") return { kind: "txt", title, content: sanitizeContent(plainTextToHtml(text)) };
  return { kind: "md", title, content: markdownToHtml(text) };
}
