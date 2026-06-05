import { normalizeDomain, normalizeText } from "@/lib/domain";
import type { Entry, EntryPatch, NewEntry } from "@/lib/types";

/**
 * Compare a user's edits to an original `Entry` and produce the minimal
 * `EntryPatch` containing only fields that actually changed.
 *
 * - `domain` is normalized before comparison so cosmetic edits (case, leading
 *   `www.`, full URL paste) don't trigger a write.
 * - String fields are trimmed before comparison, mirroring `storage.updateEntry`
 *   so a whitespace-only edit no-ops.
 * - The original's optional fields (`loginDetail`, `notes`) are treated as
 *   empty strings when undefined, so saving "" over a never-set field no-ops.
 */
export function computePatch(original: Entry, draft: NewEntry): EntryPatch {
  const patch: EntryPatch = {};

  const draftDomain = normalizeDomain(draft.domain);
  if (draftDomain !== original.domain) patch.domain = draftDomain;

  const draftLoginType = normalizeText(draft.loginType);
  if (draftLoginType !== original.loginType) patch.loginType = draftLoginType;

  const draftLoginDetail = normalizeText(draft.loginDetail);
  if (draftLoginDetail !== normalizeText(original.loginDetail)) {
    patch.loginDetail = draftLoginDetail;
  }

  const draftNotes = normalizeText(draft.notes);
  if (draftNotes !== normalizeText(original.notes)) patch.notes = draftNotes;

  return patch;
}
