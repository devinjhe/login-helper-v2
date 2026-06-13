/**
 * The predefined login types offered in the add/edit form's login-type dropdown.
 * Single source of truth — the dropdown (`LoginTypeSelect`) renders exactly these.
 *
 * `loginType` remains a free-text `string` in the data model (see `types.ts`), so
 * older entries may hold values outside this list; `LoginTypeSelect` injects any
 * such legacy value as an extra option rather than silently rewriting it.
 *
 * `"Other"` is a normal selectable value stored verbatim as `loginType: "Other"`
 * — a catch-all for sites that don't fit the named types.
 */
export const LOGIN_TYPES = [
  "Google",
  "GitHub",
  "Apple",
  "Email",
  "Username",
  "SSO",
  "Other",
] as const;

export type LoginType = (typeof LOGIN_TYPES)[number];
