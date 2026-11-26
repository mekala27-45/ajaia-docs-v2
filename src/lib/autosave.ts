// Autosave engine for the editor. It has no React and no fetch in it, so the
// timing and failure rules can be unit tested with fake timers.

export type SaveState =
  | "saved" // everything typed so far is stored
  | "unsaved" // edits are waiting for the debounce timer
  | "saving" // a request is in flight
  | "retrying" // the last request failed for a temporary reason
  | "error" // the server refused the content (for example it is too large)
  | "conflict" // someone else saved a newer version
  | "blocked"; // access was removed, saving is no longer possible

export type SaveResult = {
  version: number;
  updatedAt: string;
  updatedByName: string | null;
};

export type SaveFailure =
  | { kind: "conflict"; message: string; updatedByName?: string | null }
  | { kind: "access"; message: string }
  | { kind: "rejected"; message: string }
  | { kind: "transient"; message: string };

export type SaveSnapshot = {
  state: SaveState;
  message: string | null;
  lastSaved: SaveResult | null;
  conflictBy: string | null;
};

type Options = {
  /** The content version the editor was loaded with. */
  version: number;
  /** Quiet time after the last keystroke before a save starts. */
  delayMs?: number;
  send: (content: string, baseVersion: number) => Promise<SaveResult>;
  /** Maps a thrown error onto one of the failure kinds above. */
  classify: (err: unknown) => SaveFailure;
  onChange: (snapshot: SaveSnapshot) => void;
};

const MAX_RETRY_DELAY_MS = 30_000;

export class Autosaver {
  private version: number;
  private content: string | null = null;
  private dirty = false;
  private state: SaveState = "saved";
  private message: string | null = null;
  private lastSaved: SaveResult | null = null;
  private conflictBy: string | null = null;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private disposed = false;
  private readonly delayMs: number;

  constructor(private readonly options: Options) {
    this.version = options.version;
    this.delayMs = options.delayMs ?? 800;
  }

  get currentVersion(): number {
    return this.version;
  }

  /** True while there is typed content the server has not confirmed yet. */
  get hasUnsavedWork(): boolean {
    return this.dirty || this.inFlight !== null;
  }

  get isStopped(): boolean {
    return this.state === "conflict" || this.state === "blocked";
  }

  /** Call on every editor change with the full document HTML. */
  edit(content: string): void {
    this.content = content;
    this.dirty = true;
    if (this.isStopped) return; // keep the text, but do not save over a conflict
    if (!this.inFlight) this.set("unsaved");
    this.schedule(this.delayMs);
  }

  /** Saves right away and resolves when the server has answered. */
  async flush(): Promise<void> {
    this.clearTimer();
    if (this.inFlight) await this.inFlight;
    this.clearTimer();
    this.start();
    if (this.inFlight) await this.inFlight;
  }

  /** The editor now shows the server copy at this version. Local edits are dropped. */
  adoptRemote(result: SaveResult): void {
    this.clearTimer();
    this.version = result.version;
    this.lastSaved = result;
    this.dirty = false;
    this.attempt = 0;
    this.conflictBy = null;
    this.set("saved");
  }

  /** Resolves a conflict by saving the local text on top of the newer version. */
  async overwrite(latestVersion: number): Promise<void> {
    this.version = latestVersion;
    this.conflictBy = null;
    this.dirty = this.content !== null;
    this.set("unsaved");
    await this.flush();
  }

  /** What still needs to be sent if the page is closing right now. */
  pendingPayload(): { content: string; baseVersion: number } | null {
    if (!this.dirty || this.content === null || this.isStopped) return null;
    return { content: this.content, baseVersion: this.version };
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }

  private start(): void {
    if (this.inFlight || this.disposed) return;
    if (!this.dirty || this.content === null || this.isStopped) return;
    this.inFlight = this.run().finally(() => {
      this.inFlight = null;
    });
  }

  private async run(): Promise<void> {
    const content = this.content as string;
    this.dirty = false;
    this.set("saving");
    try {
      const result = await this.options.send(content, this.version);
      this.version = result.version;
      this.lastSaved = result;
      this.attempt = 0;
      if (this.dirty) {
        // The user kept typing while the request was in flight.
        this.set("unsaved");
        this.schedule(this.delayMs);
      } else {
        this.set("saved");
      }
    } catch (err) {
      this.dirty = true;
      const failure = this.options.classify(err);
      if (failure.kind === "conflict") {
        this.conflictBy = failure.updatedByName ?? null;
        this.set("conflict", failure.message);
      } else if (failure.kind === "access") {
        this.set("blocked", failure.message);
      } else if (failure.kind === "rejected") {
        // Retrying the same content cannot work. The next edit tries again.
        this.set("error", failure.message);
      } else {
        this.attempt += 1;
        this.set("retrying", failure.message);
        this.schedule(Math.min(2000 * 2 ** (this.attempt - 1), MAX_RETRY_DELAY_MS));
      }
    }
  }

  private schedule(delayMs: number): void {
    this.clearTimer();
    if (this.disposed) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.start();
    }, delayMs);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private set(state: SaveState, message: string | null = null): void {
    this.state = state;
    this.message = message;
    if (this.disposed) return;
    this.options.onChange({
      state,
      message,
      lastSaved: this.lastSaved,
      conflictBy: this.conflictBy,
    });
  }
}
