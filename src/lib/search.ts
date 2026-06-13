import type { Entry } from "./types";

/**
 * Case-insensitive substring match across every user-visible field of an entry:
 * domain, login type, login detail, and notes. Pure and side-effect-free so the
 * popup can filter `getAllEntries()` results client-side and tests can assert it
 * directly.
 *
 * An empty/whitespace-only query matches everything (the caller decides whether
 * to filter at all).
 */
export function entryMatches(entry: Entry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [entry.domain, entry.loginType, entry.loginDetail ?? "", entry.notes ?? ""].some(
    (field) => field.toLowerCase().includes(needle),
  );
}
