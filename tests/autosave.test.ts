import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Autosaver, type SaveFailure, type SaveResult, type SaveSnapshot } from "@/lib/autosave";

type Call = { content: string; baseVersion: number };

function setup(options: { failures?: SaveFailure[]; holdFirst?: boolean } = {}) {
  const calls: Call[] = [];
  const states: SaveSnapshot[] = [];
  const failures = [...(options.failures ?? [])];
  let release: (() => void) | null = null;
  let version = 1;

  const saver = new Autosaver({
    version: 1,
    delayMs: 800,
    send: async (content, baseVersion) => {
      calls.push({ content, baseVersion });
      if (options.holdFirst && calls.length === 1) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      const failure = failures.shift();
      if (failure) throw failure;
      version = baseVersion + 1;
      const result: SaveResult = { version, updatedAt: "2026-01-01T00:00:00.000Z", updatedByName: "Alice" };
      return result;
    },
    classify: (err) => err as SaveFailure,
    onChange: (snapshot) => states.push(snapshot),
  });

  return {
    saver,
    calls,
    states,
    last: () => states[states.length - 1],
    release: () => release?.(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Autosaver", () => {
  it("waits for a pause in typing and sends only the latest content", async () => {
    const t = setup();
    t.saver.edit("<p>a</p>");
    await vi.advanceTimersByTimeAsync(500);
    t.saver.edit("<p>ab</p>");
    await vi.advanceTimersByTimeAsync(500);
    expect(t.calls).toHaveLength(0);
    expect(t.last().state).toBe("unsaved");

    await vi.advanceTimersByTimeAsync(300);
    expect(t.calls).toEqual([{ content: "<p>ab</p>", baseVersion: 1 }]);
    expect(t.last().state).toBe("saved");
    expect(t.saver.currentVersion).toBe(2);
  });

  it("never runs two saves at once and follows up with edits made meanwhile", async () => {
    const t = setup({ holdFirst: true });
    t.saver.edit("<p>one</p>");
    await vi.advanceTimersByTimeAsync(800);
    expect(t.calls).toHaveLength(1);
    expect(t.last().state).toBe("saving");

    t.saver.edit("<p>two</p>");
    await vi.advanceTimersByTimeAsync(2000);
    expect(t.calls).toHaveLength(1); // still waiting for the first answer

    t.release();
    await vi.advanceTimersByTimeAsync(800);
    expect(t.calls).toEqual([
      { content: "<p>one</p>", baseVersion: 1 },
      { content: "<p>two</p>", baseVersion: 2 },
    ]);
    expect(t.last().state).toBe("saved");
  });

  it("stops on a conflict and does not overwrite until the user decides", async () => {
    const t = setup({
      failures: [{ kind: "conflict", message: "Bob saved a newer version.", updatedByName: "Bob" }],
    });
    t.saver.edit("<p>mine</p>");
    await vi.advanceTimersByTimeAsync(800);
    expect(t.last()).toMatchObject({ state: "conflict", conflictBy: "Bob" });

    t.saver.edit("<p>mine, more</p>");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.calls).toHaveLength(1);
    expect(t.saver.pendingPayload()).toBeNull();

    await t.saver.overwrite(5);
    expect(t.calls[1]).toEqual({ content: "<p>mine, more</p>", baseVersion: 5 });
    expect(t.last().state).toBe("saved");
  });

  it("drops local edits when the user loads the latest version", async () => {
    const t = setup({ failures: [{ kind: "conflict", message: "Newer version." }] });
    t.saver.edit("<p>mine</p>");
    await vi.advanceTimersByTimeAsync(800);

    t.saver.adoptRemote({ version: 7, updatedAt: "2026-01-02T00:00:00.000Z", updatedByName: "Bob" });
    expect(t.last().state).toBe("saved");
    expect(t.saver.currentVersion).toBe(7);
    expect(t.saver.hasUnsavedWork).toBe(false);
  });

  it("retries temporary failures with a growing delay", async () => {
    const t = setup({
      failures: [
        { kind: "transient", message: "Offline" },
        { kind: "transient", message: "Offline" },
      ],
    });
    t.saver.edit("<p>x</p>");
    await vi.advanceTimersByTimeAsync(800);
    expect(t.last().state).toBe("retrying");

    await vi.advanceTimersByTimeAsync(1999);
    expect(t.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.calls).toHaveLength(2); // retry after 2 s

    await vi.advanceTimersByTimeAsync(3999);
    expect(t.calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.calls).toHaveLength(3); // retry after 4 s
    expect(t.last().state).toBe("saved");
  });

  it("does not retry content the server rejected, but tries again after an edit", async () => {
    const t = setup({ failures: [{ kind: "rejected", message: "Too large." }] });
    t.saver.edit("<p>big</p>");
    await vi.advanceTimersByTimeAsync(800);
    expect(t.last()).toMatchObject({ state: "error", message: "Too large." });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.calls).toHaveLength(1);

    t.saver.edit("<p>small</p>");
    await vi.advanceTimersByTimeAsync(800);
    expect(t.calls).toHaveLength(2);
    expect(t.last().state).toBe("saved");
  });

  it("stops for good when access is removed", async () => {
    const t = setup({ failures: [{ kind: "access", message: "No access." }] });
    t.saver.edit("<p>x</p>");
    await vi.advanceTimersByTimeAsync(800);
    expect(t.last().state).toBe("blocked");

    t.saver.edit("<p>y</p>");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.calls).toHaveLength(1);
  });

  it("flush saves immediately and reports what is still pending before that", async () => {
    const t = setup();
    t.saver.edit("<p>now</p>");
    expect(t.saver.pendingPayload()).toEqual({ content: "<p>now</p>", baseVersion: 1 });

    await t.saver.flush();
    expect(t.calls).toHaveLength(1);
    expect(t.saver.pendingPayload()).toBeNull();
    expect(t.last().state).toBe("saved");
  });

  it("does nothing after dispose", async () => {
    const t = setup();
    t.saver.edit("<p>x</p>");
    t.saver.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.calls).toHaveLength(0);
  });
});
