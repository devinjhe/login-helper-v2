/**
 * Domain helpers for the popup. The popup pre-selects the active tab's domain
 * so suggestions match the site the user is currently on.
 */

/**
 * Lowercase, strip a leading `www.`, and accept either a bare host or a full URL.
 * The acceptance rule is loose on purpose — `entries.domain` is free-text and
 * users may save things under arbitrary labels (intranet hosts, IPs, etc.).
 */
/**
 * Coalesce an optional string to `""` and trim it. The single source for the
 * "treat undefined as empty, ignore surrounding whitespace" rule shared by the
 * storage write path (`addEntry`/`updateEntry`) and the popup's edit diff
 * (`computePatch`) — keep those callers in lockstep by routing through here.
 */
export function normalizeText(input: string | undefined): string {
  return (input ?? "").trim();
}

export function normalizeDomain(input: string): string {
  if (!input) return "";

  let host = input.trim();
  // If it parses as a URL, take the hostname; otherwise treat the input as a host.
  try {
    const parsed = new URL(host);
    host = parsed.hostname;
  } catch {
    // Not a URL — fall through with the trimmed input.
  }

  host = host.toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);
  return host;
}

/**
 * Returns the normalized domain of the active tab in the current window, or
 * `null` if there is no active tab or the tab has no URL (e.g. `chrome://` pages).
 *
 * Requires the `tabs` permission, which is declared in `wxt.config.ts`.
 */
export async function getActiveTabDomain(): Promise<string | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tabs[0]?.url;
  if (!url) return null;
  const normalized = normalizeDomain(url);
  return normalized || null;
}
