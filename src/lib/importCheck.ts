import { IMPORT_EXTENSIONS, IMPORT_HELP, MAX_IMPORT_BYTES } from "./limits";

/**
 * Quick check in the browser so the user gets an answer before uploading.
 * The server runs the same rules again and also inspects the file contents.
 * Returns a message when the file cannot be imported, otherwise null.
 */
export function checkImportFile(file: { name: string; size: number }): string | null {
  const dot = file.name.lastIndexOf(".");
  const ext = dot > 0 ? file.name.slice(dot).toLowerCase() : "";
  if (!(IMPORT_EXTENSIONS as readonly string[]).includes(ext)) {
    const label = ext ? `${ext} files are` : "This file type is";
    return `${label} not supported. ${IMPORT_HELP}`;
  }
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_IMPORT_BYTES) return `This file is too large. ${IMPORT_HELP}`;
  return null;
}
