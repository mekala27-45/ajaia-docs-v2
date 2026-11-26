export type ErrorCode =
  | "bad_request"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "payload_too_large"
  | "unsupported_media_type"
  | "internal";

/**
 * An error that is safe to show to the user. Services throw these and the
 * route layer turns them into JSON responses with the matching HTTP status.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string) => new AppError(400, "bad_request", message);
export const forbidden = (message: string) => new AppError(403, "forbidden", message);
export const notFound = (message: string) => new AppError(404, "not_found", message);
export const conflict = (message: string, details?: Record<string, unknown>) =>
  new AppError(409, "conflict", message, details);
export const payloadTooLarge = (message: string) =>
  new AppError(413, "payload_too_large", message);
export const unsupportedMediaType = (message: string) =>
  new AppError(415, "unsupported_media_type", message);
