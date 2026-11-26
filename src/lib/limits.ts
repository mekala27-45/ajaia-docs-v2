// Limits and labels shared by the browser and the server.
// The server enforces every one of these. The browser only uses them to give
// faster feedback and to tell the user what is allowed.

export const MAX_TITLE_LENGTH = 120;
export const MAX_CONTENT_CHARS = 400_000;
export const DEFAULT_TITLE = "Untitled document";

// Vercel rejects request bodies above 4.5 MB, so imports stop at 4 MB.
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;
export const IMPORT_EXTENSIONS = [".txt", ".md", ".markdown", ".docx"] as const;
export const IMPORT_ACCEPT = IMPORT_EXTENSIONS.join(",");
export const IMPORT_HELP = "Supported files: .txt, .md and .docx, up to 4 MB.";

export type ShareRole = "viewer" | "editor";
export type Access = "owner" | ShareRole;

export const ACCESS_LABEL: Record<Access, string> = {
  owner: "Owner",
  editor: "Can edit",
  viewer: "View only",
};
