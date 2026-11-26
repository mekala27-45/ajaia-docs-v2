import { describe, expect, it } from "vitest";
import { canEdit, canManage, resolveAccess } from "@/server/access";

describe("resolveAccess", () => {
  it("makes the owner an owner even when a share row also exists", () => {
    expect(resolveAccess("u1", "u1", null)).toBe("owner");
    expect(resolveAccess("u1", "u1", "viewer")).toBe("owner");
  });

  it("uses the share role for everyone else", () => {
    expect(resolveAccess("u2", "u1", "editor")).toBe("editor");
    expect(resolveAccess("u2", "u1", "viewer")).toBe("viewer");
  });

  it("gives no access without a share row", () => {
    expect(resolveAccess("u2", "u1", null)).toBeNull();
    expect(resolveAccess("u2", "u1", undefined)).toBeNull();
  });

  it("gives no access to a missing user", () => {
    expect(resolveAccess(null, "u1", "editor")).toBeNull();
    expect(resolveAccess("", "u1", "editor")).toBeNull();
    expect(resolveAccess(undefined, "u1", "editor")).toBeNull();
  });
});

describe("permissions", () => {
  it("lets owners and editors edit, but not viewers or strangers", () => {
    expect(canEdit("owner")).toBe(true);
    expect(canEdit("editor")).toBe(true);
    expect(canEdit("viewer")).toBe(false);
    expect(canEdit(null)).toBe(false);
  });

  it("lets only the owner share and delete", () => {
    expect(canManage("owner")).toBe(true);
    expect(canManage("editor")).toBe(false);
    expect(canManage("viewer")).toBe(false);
    expect(canManage(null)).toBe(false);
  });
});
