/**
 * The single source of truth for the document shape stored in Firestore under
 * `entries/{id}`. The popup, storage layer, and tests all import from here.
 */
export interface Entry {
  id: string;
  /** Normalized domain (lowercased, no `www.`). Plain string — anything containing a `.` is fine. */
  domain: string;
  /** Free-text login type (e.g. "Google", "Email", "Username", or arbitrary). */
  loginType: string;
  /** Optional — the actual email/username/handle the user logs in with. */
  loginDetail?: string;
  /** Optional free-form notes. */
  notes?: string;
  /** Firebase Auth UID of the owning user. Every read/write is scoped on this. */
  userId: string;
  /** Epoch milliseconds. */
  createdAt: number;
  /** Epoch milliseconds. */
  updatedAt: number;
}

/**
 * Fields the caller supplies when adding a new entry. The storage layer fills in
 * `id`, `userId`, `createdAt`, and `updatedAt`.
 */
export type NewEntry = Omit<Entry, "id" | "userId" | "createdAt" | "updatedAt">;

/**
 * Fields the caller is allowed to change via `updateEntry`. `id`, `userId`,
 * `createdAt`, and `updatedAt` are immutable from the client's perspective —
 * `updatedAt` is set by the storage layer, the rest are server-enforced via
 * Firestore rules.
 */
export type EntryPatch = Partial<Pick<Entry, "domain" | "loginType" | "loginDetail" | "notes">>;
