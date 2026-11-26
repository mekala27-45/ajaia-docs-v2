import { Check, CircleAlert, LoaderCircle, PencilLine, RefreshCw } from "lucide-react";
import { cx } from "@/components/ui";
import type { SaveSnapshot, SaveState } from "@/lib/autosave";

const VIEWS: Record<SaveState, { label: string; tone: string; Icon: typeof Check }> = {
  saved: { label: "Saved", tone: "text-emerald-700", Icon: Check },
  unsaved: { label: "Unsaved changes", tone: "text-slate-500", Icon: PencilLine },
  saving: { label: "Saving...", tone: "text-slate-500", Icon: LoaderCircle },
  retrying: { label: "Not saved. Retrying...", tone: "text-amber-700", Icon: RefreshCw },
  error: { label: "Not saved", tone: "text-red-700", Icon: CircleAlert },
  conflict: { label: "Not saved. Newer version exists", tone: "text-amber-700", Icon: CircleAlert },
  blocked: { label: "Not saved", tone: "text-red-700", Icon: CircleAlert },
};

/** The small status next to the title. Screen readers hear every change. */
export function SaveStatus({ snapshot }: { snapshot: SaveSnapshot }) {
  const view = VIEWS[snapshot.state];
  return (
    <span
      role="status"
      aria-live="polite"
      data-testid="save-status"
      data-state={snapshot.state}
      className={cx("inline-flex shrink-0 items-center gap-1.5 text-xs font-medium", view.tone)}
    >
      <view.Icon className={cx("h-3.5 w-3.5", snapshot.state === "saving" && "animate-spin")} />
      {view.label}
    </span>
  );
}
