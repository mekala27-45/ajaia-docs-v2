/** A failed API call, with the HTTP status and the server's error code. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Options = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Sent as a JSON body. */
  json?: unknown;
  /** Sent as is, for file uploads. */
  form?: FormData;
};

/** Small fetch wrapper: JSON in, JSON out, and one error type for every failure. */
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? (options.json !== undefined || options.form ? "POST" : "GET"),
      headers: options.json !== undefined ? { "content-type": "application/json" } : undefined,
      body: options.json !== undefined ? JSON.stringify(options.json) : options.form,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "network", "Could not reach the server. Check your connection and try again.");
  }

  const data = (await response.json().catch(() => null)) as
    | { error?: { code?: string; message?: string; details?: Record<string, unknown> } }
    | null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error?.code ?? "internal",
      data?.error?.message ?? "Something went wrong. Please try again.",
      data?.error?.details,
    );
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}
