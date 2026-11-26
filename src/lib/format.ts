const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const absolute = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });

/** "just now", "5 minutes ago", "yesterday", then a plain date after a week. */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  const seconds = Math.round((then - now) / 1000);
  const elapsed = Math.abs(seconds);

  if (elapsed < 45) return "just now";
  if (elapsed < 3600) return relative.format(Math.round(seconds / 60), "minute");
  if (elapsed < 86_400) return relative.format(Math.round(seconds / 3600), "hour");
  if (elapsed < 7 * 86_400) return relative.format(Math.round(seconds / 86_400), "day");
  return absolute.format(new Date(iso));
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
