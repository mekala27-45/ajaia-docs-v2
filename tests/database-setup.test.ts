import { describe, expect, it } from "vitest";
import { isHostedPlatform } from "@/server/db/client";
import {
  diagnoseDatabaseError,
  isPostgresUrl,
  normalizeDatabaseUrl,
  safeErrorDetail,
} from "@/server/db/diagnose";
import { canRetryOnce, poolSettings } from "@/server/db/postgres";

const URL = "postgresql://app_user:s3cret@db.example.com/app?sslmode=require";

describe("normalizeDatabaseUrl", () => {
  it("accepts a clean connection string", () => {
    expect(normalizeDatabaseUrl(URL)).toBe(URL);
    expect(normalizeDatabaseUrl(`  ${URL}\n`)).toBe(URL);
  });

  it("accepts the psql command that database consoles offer for copying", () => {
    expect(normalizeDatabaseUrl(`psql '${URL}'`)).toBe(URL);
    expect(normalizeDatabaseUrl(`psql "${URL}"`)).toBe(URL);
    expect(normalizeDatabaseUrl(`'${URL}'`)).toBe(URL);
  });

  it("treats empty values as not set", () => {
    expect(normalizeDatabaseUrl(undefined)).toBeNull();
    expect(normalizeDatabaseUrl("   ")).toBeNull();
    expect(normalizeDatabaseUrl("''")).toBeNull();
  });

  it("recognizes Postgres addresses and nothing else", () => {
    expect(isPostgresUrl(URL)).toBe(true);
    expect(isPostgresUrl("postgres://u:p@host/db")).toBe(true);
    expect(isPostgresUrl("mysql://u:p@host/db")).toBe(false);
    expect(isPostgresUrl("db.example.com")).toBe(false);
    expect(isPostgresUrl("postgresql://u:p@host/db extra words")).toBe(false);
  });
});

describe("diagnoseDatabaseError", () => {
  const diagnose = (error: object) => diagnoseDatabaseError(Object.assign(new Error("x"), error));

  it("maps common failures to a reason an operator can act on", () => {
    expect(diagnose({ code: "ENOTFOUND" }).reason).toBe("host_not_found");
    expect(diagnose({ code: "ECONNREFUSED" }).reason).toBe("connection_refused");
    expect(diagnose({ code: "28P01" }).reason).toBe("authentication_failed");
    expect(diagnose({ code: "3D000" }).reason).toBe("database_not_found");
    expect(diagnose({ code: "42501" }).reason).toBe("permission_denied");
    expect(diagnose({ message: "Connection terminated due to connection timeout" }).reason).toBe("timeout");
    expect(diagnose({ message: "self-signed certificate in certificate chain" }).reason).toBe("tls");
    expect(diagnose({ code: "ERR_INVALID_URL", message: "Invalid URL" }).reason).toBe("invalid_connection_string");
  });

  it("tells a missing setting apart from a malformed one", () => {
    const missing = Object.assign(new Error("DATABASE_URL is not set."), { name: "DatabaseConfigError" });
    const malformed = Object.assign(new Error("DATABASE_URL must start with postgresql://"), {
      name: "DatabaseConfigError",
    });
    expect(diagnoseDatabaseError(missing).reason).toBe("missing_database_url");
    expect(diagnoseDatabaseError(malformed).reason).toBe("invalid_connection_string");
  });

  it("falls back to unknown without throwing", () => {
    expect(diagnoseDatabaseError(null).reason).toBe("unknown");
    expect(diagnoseDatabaseError("boom").reason).toBe("unknown");
  });

  it("never leaks the connection string in operator detail", () => {
    const detail = safeErrorDetail(new Error(`could not connect to ${URL} password=s3cret`));
    expect(detail).not.toContain("s3cret");
    expect(detail).not.toContain("db.example.com");
  });
});

describe("connection handling", () => {
  it("retries a read once after a dropped connection, and never a write", () => {
    const dropped = new Error("Connection terminated unexpectedly");
    expect(canRetryOnce("SELECT 1", dropped)).toBe(true);
    expect(canRetryOnce("  select * from t", Object.assign(new Error("x"), { code: "ECONNRESET" }))).toBe(true);
    expect(canRetryOnce("UPDATE t SET a = 1", dropped)).toBe(false);
    expect(canRetryOnce("INSERT INTO t VALUES (1)", dropped)).toBe(false);
    expect(canRetryOnce("SELECT 1", new Error("syntax error"))).toBe(false);
  });

  it("releases idle connections quickly on serverless hosts", () => {
    expect(poolSettings(true).idleTimeoutMillis).toBeLessThan(poolSettings(false).idleTimeoutMillis);
  });

  it("knows when it runs on a host without a durable disk", () => {
    expect(isHostedPlatform({ NETLIFY: "true" })).toBe(true);
    expect(isHostedPlatform({ AWS_LAMBDA_FUNCTION_NAME: "fn" })).toBe(true);
    expect(isHostedPlatform({})).toBe(false);
  });
});
