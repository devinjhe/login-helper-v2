import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { normalizeDomain, normalizeText } from "./domain";
import type { Entry, EntryPatch, NewEntry, SavedLogin } from "./types";

/**
 * The only module that touches Firestore. Every read and write is scoped to
 * `auth.currentUser.uid` so a future React Native app on the same Google
 * account sees exactly the same data, and the deployed `firestore.rules`
 * enforce the same scoping server-side.
 *
 * All four functions throw if there is no signed-in user — components must
 * gate calls behind `useAuthUser`.
 *
 * The popup fetches all of a user's entries once on mount (`getAllEntries`)
 * and filters client-side: the "This site" tab keeps the active-tab domain,
 * the "All" tab lists everything, and the search box filters within the active
 * tab across all fields. Single-user, low-thousands of entries — fine at this
 * scale. If entry counts grow past ~1k or multi-user collaboration appears,
 * swap to a server-side index (Algolia/Typesense, or maintain a lowercased
 * `domainPrefixes` array with `array-contains-any`).
 */

const ENTRIES = "entries";
const SAVED_LOGINS = "savedLogins";

function requireUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error("Not signed in: storage operations require a Firebase user.");
  }
  return uid;
}

export async function addEntry(input: NewEntry): Promise<Entry> {
  const userId = requireUid();
  const now = Date.now();
  const payload = {
    domain: normalizeDomain(input.domain),
    loginType: normalizeText(input.loginType),
    loginDetail: normalizeText(input.loginDetail),
    notes: normalizeText(input.notes),
    userId,
    createdAt: now,
    updatedAt: now,
  };
  const ref = await addDoc(collection(db, ENTRIES), payload);
  return { id: ref.id, ...payload };
}

export async function updateEntry(id: string, patch: EntryPatch): Promise<void> {
  requireUid();

  // No-op patches: nothing to write, don't bump `updatedAt` for nothing.
  // The popup's edit form short-circuits before calling here, but a future
  // caller could reach this path; cheaper to guard than to fan a Firestore write.
  if (Object.keys(patch).length === 0) return;

  const finalPatch: Record<string, unknown> = { ...patch, updatedAt: Date.now() };
  if (typeof finalPatch.domain === "string") {
    finalPatch.domain = normalizeDomain(finalPatch.domain);
  }
  // The popup's `computePatch` already trims, but this is the storage boundary
  // — defensive against future direct callers (e.g. the planned mobile app)
  // that may not normalize on the way in.
  for (const key of ["loginType", "loginDetail", "notes"] as const) {
    if (typeof finalPatch[key] === "string") {
      finalPatch[key] = normalizeText(finalPatch[key] as string);
    }
  }
  // Cross-user mutation is enforced server-side by `firestore.rules` (which
  // checks `request.auth.uid == resource.data.userId`); EntryPatch's type
  // shape prevents the caller from sending immutable fields in the first place.
  await updateDoc(doc(db, ENTRIES, id), finalPatch);
}

export async function deleteEntry(id: string): Promise<void> {
  // Ownership is enforced by `firestore.rules`; we don't pre-fetch the doc to
  // verify ownership client-side. A cross-user delete attempt fails server-side.
  requireUid();
  await deleteDoc(doc(db, ENTRIES, id));
}

/**
 * Fetch every entry owned by the signed-in user. The popup calls this once on
 * mount and derives both suggest- and search-mode views via client-side
 * filtering, so a single Firestore read covers the popup's lifetime.
 */
export async function getAllEntries(): Promise<Entry[]> {
  const userId = requireUid();
  const q = query(collection(db, ENTRIES), where("userId", "==", userId));
  const snap = await getDocs(q);
  return snap.docs.map(toEntry);
}

function toEntry(snap: { id: string; data: () => unknown }): Entry {
  const data = snap.data() as Partial<Entry>;
  if (
    typeof data.domain !== "string" ||
    typeof data.loginType !== "string" ||
    typeof data.userId !== "string" ||
    typeof data.createdAt !== "number" ||
    typeof data.updatedAt !== "number"
  ) {
    throw new Error(`Malformed entry "${snap.id}": missing required fields.`);
  }
  if (data.loginDetail !== undefined && typeof data.loginDetail !== "string") {
    throw new Error(`Malformed entry "${snap.id}": loginDetail is not a string.`);
  }
  if (data.notes !== undefined && typeof data.notes !== "string") {
    throw new Error(`Malformed entry "${snap.id}": notes is not a string.`);
  }
  return {
    id: snap.id,
    domain: data.domain,
    loginType: data.loginType,
    loginDetail: data.loginDetail,
    notes: data.notes,
    userId: data.userId,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

// ── Saved logins ────────────────────────────────────────────────────────────
// Reusable credential values (e.g. common emails) the user saves once and picks
// when filling an entry's login detail. Value-only: no update path — editing is
// delete + re-add. Same uid-scoping and trim-at-the-boundary discipline as
// entries above.

/**
 * Fetch every saved login owned by the signed-in user. The popup loads these
 * once on mount alongside `getAllEntries` and suggests them in the entry form.
 */
export async function getSavedLogins(): Promise<SavedLogin[]> {
  const userId = requireUid();
  const q = query(collection(db, SAVED_LOGINS), where("userId", "==", userId));
  const snap = await getDocs(q);
  return snap.docs.map(toSavedLogin);
}

/**
 * Persist a reusable credential value. The value is trimmed here (the storage
 * boundary); callers should dedupe (case-insensitively) before calling so the
 * suggestion list stays clean.
 */
export async function addSavedLogin(value: string): Promise<SavedLogin> {
  const userId = requireUid();
  const payload = {
    value: normalizeText(value),
    userId,
    createdAt: Date.now(),
  };
  const ref = await addDoc(collection(db, SAVED_LOGINS), payload);
  return { id: ref.id, ...payload };
}

export async function deleteSavedLogin(id: string): Promise<void> {
  // Ownership is enforced by `firestore.rules`; a cross-user delete fails server-side.
  requireUid();
  await deleteDoc(doc(db, SAVED_LOGINS, id));
}

function toSavedLogin(snap: { id: string; data: () => unknown }): SavedLogin {
  const data = snap.data() as Partial<SavedLogin>;
  if (
    typeof data.value !== "string" ||
    typeof data.userId !== "string" ||
    typeof data.createdAt !== "number"
  ) {
    throw new Error(`Malformed saved login "${snap.id}": missing required fields.`);
  }
  return {
    id: snap.id,
    value: data.value,
    userId: data.userId,
    createdAt: data.createdAt,
  };
}
