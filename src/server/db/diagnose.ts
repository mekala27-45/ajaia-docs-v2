// Turns a database failure into a short reason and a hint a person can act on.
// Used by the setup screen and by /api/health. No connection strings, user
// names or passwords are ever included in the output.

export type DatabaseDiagnosis = {
  reason:
    | "missing_database_url"
    | "invalid_connection_string"
    | "host_not_found"
    | "connection_refused"
    | "authentication_failed"
    | "database_not_found"
    | "permission_denied"
    | "timeout"
    | "tls"
    | "unknown";
  hint: string;
  /** Postgres or Node error code, when there is one. */
  code?: string;
};

/**
 * Accepts the connection string the way people actually paste it. Database
 * consoles offer it as a psql command (psql 'postgresql://...') or as a line
 * for an .env file (DATABASE_URL="postgresql://..."), so the address is pulled
 * out of whatever surrounds it.
 */
export function normalizeDatabaseUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  const address = value.match(/postgres(?:ql)?:\/\/[^\s'"`]+/i);
  if (address) return address[0];
  const stripped = value.replace(/^['"`]+|['"`]+$/g, "").trim();
  return stripped || null;
}

/**
 * Facts about a rejected value that help fix it and reveal nothing secret:
 * no characters of the value itself are returned.
 */
export function describeValueShape(raw: string | undefined) {
  const value = raw ?? "";
  return {
    length: value.length,
    lines: value.split(/\r?\n/).length,
    containsPostgresAddress: /postgres(?:ql)?:\/\//i.test(value),
    containsSpaces: /\s/.test(value.trim()),
    containsQuotes: /['"`]/.test(value),
    looksLikeHttpAddress: /^https?:\/\//i.test(value.trim()),
  };
}

export function isPostgresUrl(value: string): boolean {
  return /^postgres(ql)?:\/\/\S+$/i.test(value);
}

export function diagnoseDatabaseError(err: unknown): DatabaseDiagnosis {
  const error = (err ?? {}) as { name?: string; code?: unknown; message?: unknown };
  const code = typeof error.code === "string" ? error.code : undefined;
  const message = typeof error.message === "string" ? error.message : "";

  if (error.name === "DatabaseConfigError") {
    const invalid = /must start with/i.test(message);
    return { reason: invalid ? "invalid_connection_string" : "missing_database_url", hint: message };
  }
  if (code === "ERR_INVALID_URL" || /invalid (url|connection string)/i.test(message)) {
    return {
      reason: "invalid_connection_string",
      hint: "DATABASE_URL is not a valid Postgres address. It must start with postgresql:// and contain nothing else.",
      code,
    };
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return {
      reason: "host_not_found",
      hint: "The database host in DATABASE_URL could not be found. Check the value for typos.",
      code,
    };
  }
  if (code === "ECONNREFUSED") {
    return {
      reason: "connection_refused",
      hint: "Nothing accepted the connection. DATABASE_URL does not seem to point at a running Postgres server.",
      code,
    };
  }
  if (code === "28P01" || code === "28000") {
    return {
      reason: "authentication_failed",
      hint: "The database rejected the user name or password in DATABASE_URL.",
      code,
    };
  }
  if (code === "3D000") {
    return { reason: "database_not_found", hint: "The database named in DATABASE_URL does not exist.", code };
  }
  if (code === "42501") {
    return {
      reason: "permission_denied",
      hint: "The database user is not allowed to create the ajaia_docs schema and its tables.",
      code,
    };
  }
  if (code === "ETIMEDOUT" || /timeout|timed out/i.test(message)) {
    return {
      reason: "timeout",
      hint: "The database did not answer in time. A free database that was asleep can need a few seconds. Try again.",
      code,
    };
  }
  if (/ssl|tls|certificate/i.test(message)) {
    return {
      reason: "tls",
      hint: "The secure connection to the database failed. Add ?sslmode=require to the end of DATABASE_URL.",
      code,
    };
  }
  return {
    reason: "unknown",
    hint: "The app cannot reach its database right now. Please try again in a moment.",
    code,
  };
}

/** Error text for operators, with anything that looks like credentials removed. */
export function safeErrorDetail(err: unknown): string {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return message
    .replace(/postgres(ql)?:\/\/\S+/gi, "postgresql://[hidden]")
    .replace(/password[^\s,;]*/gi, "password[hidden]")
    .slice(0, 240);
}
