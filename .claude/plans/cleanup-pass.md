# Login Helper v2 — Cleanup Pass

## Context for the implementer

A code-review pass identified real bugs, type-safety gaps, an efficiency problem, and a refactor opportunity in the existing Login Helper v2 codebase. This plan addresses all findings in four milestones, ordered by risk × value: correctness first, then types, then behavior change, then refactor. Each milestone is independently shippable.

The slug for the feature branch is `cleanup-pass`.

## Relevant files

- `src/entrypoints/popup/SignedInApp.tsx` — popup view; M1 hoists the datalist, M3 collapses two-effect fetch logic, M4 splits the file.
- `src/lib/storage.ts` — Firestore boundary; M1 adds field trimming + runtime shape check, M1 removes dead code, M2 adopts `EntryPatch`, M3 adds `getAllEntries` and removes `getEntriesForDomain`/`searchEntries`.
- `src/lib/types.ts` — adds `EntryPatch` type in M2.
- `tests/storage.test.ts` — extended in M1 (trim + shape), reshaped in M3 (mock `getAllEntries`).
- `tests/components/SignedInApp.test.tsx`, `tests/components/EditDeleteSearch.test.tsx` — extended in M1 (datalist), migrated in M3 to mock the unified storage primitive.

## Milestones

### Milestone 1: Correctness fixes

**Status:** done

## Summary

**What changed**
- `src/lib/storage.ts`: `addEntry` and `updateEntry` now trim `loginType`/`loginDetail`/`notes` before persisting. `toEntry` validates the five required fields plus `loginDetail`/`notes` types and throws a clear `Malformed entry "<id>": …` error on bad data. The unreachable `if (!needle) return entries;` branch in `searchEntries` is removed.
- `src/entrypoints/popup/SignedInApp.tsx`: extracted `<LoginTypeSuggestions />` rendered once at the popup root so the edit form's `list="login-type-suggestions"` reference resolves; the inline `<datalist>` previously scoped to `AddEntryForm` is gone. Doc nit at the search effect comment corrected.
- `tests/storage.test.ts`: added trim tests for `addEntry` and `updateEntry`; added a 7-row table-driven test for malformed `toEntry` inputs (each missing required field and each invalid optional-field type); removed the dead empty-query test.
- `tests/components/EditDeleteSearch.test.tsx`: added a test asserting the datalist is in the DOM with all six options when the edit form is open.

**Reviewer outcome:** APPROVE-with-fixes-applied. Reviewer flagged two in-scope concerns — `toEntry` not validating optional field types, and the malformed-doc test only covering one missing-field case. Both addressed. Two other reviewer "concerns" were misreads of pre-existing code that was unchanged in M1 (the `Object.keys(mutable).length === 0` short-circuit and the search-effect `searchIdRef` bump both predate this milestone) — left as-is.

**Goal:** Fix the broken edit-form datalist, plug the storage normalization gap (text trimming), add a runtime shape check in `toEntry`, and clean up dead code + a doc nit. All low-risk, high-value, mechanically reviewable.

**Acceptance criteria:**

1. The `<datalist id="login-type-suggestions">` is rendered at module scope inside `SignedInApp` (or hoisted to a small dedicated component) so it is in the DOM whenever any form is open. A test asserts that opening the **edit** form on an existing row exposes the suggestion datalist with the expected options (Google, GitHub, Apple, Email, Username, SSO).
2. `addEntry` and `updateEntry` in `src/lib/storage.ts` trim `loginType`, `loginDetail`, and `notes` before persisting. New tests in `tests/storage.test.ts` pass `" Google "`, `"  me@x  "`, `"  hi  "` and assert the persisted payload (and update patch) has trimmed values.
3. `toEntry` validates that `domain`, `loginType`, `userId`, `createdAt`, `updatedAt` exist with the right primitive types. A new test simulates a malformed Firestore doc (missing `userId`) and asserts `getEntriesForDomain` throws a clear error rather than silently returning a malformed `Entry`.
4. The unreachable `if (!needle) return entries;` branch in `searchEntries` is removed. The corresponding `"returns the user's full entry list when query is empty"` test is also removed (the path no longer exists).
5. The doc comment at `SignedInApp.tsx:104` is corrected from "below" to "above" (the active-domain effect is *above* the search effect).
6. `npm test` is green. `npm run compile` is clean.

### Milestone 2: Type-safe `EntryPatch`

**Status:** done

## Summary

**What changed**
- `src/lib/types.ts`: added `EntryPatch = Partial<Pick<Entry, "domain" | "loginType" | "loginDetail" | "notes">>`.
- `src/lib/storage.ts`: `updateEntry` signature is now `(id: string, patch: EntryPatch)`; removed the destructure-and-strip block plus the three `void _ignored…` lines. Empty-patch short-circuit, domain normalization, and the M1-added trim loop are preserved.
- `src/entrypoints/popup/SignedInApp.tsx`: `EditEntryForm` patch construction uses `EntryPatch`.
- `tests/storage.test.ts`: updated one comment to reflect that type-level enforcement replaces the previous runtime strip.

**Reviewer outcome:** APPROVE-with-fixes-applied. Reviewer flagged a stale comment on the existing `userId` assertion in `updateEntry` tests; comment updated to describe what the test now guards (runtime spread sanity, with type-level enforcement called out).

**Goal:** Lift the runtime field-strip in `updateEntry` into the type system. Misuse becomes a compile error instead of a silent strip.

**Acceptance criteria:**

1. A new `EntryPatch` type is exported from `src/lib/types.ts`:
   ```ts
   export type EntryPatch = Partial<Pick<Entry, "domain" | "loginType" | "loginDetail" | "notes">>;
   ```
2. `updateEntry`'s signature changes to `updateEntry(id: string, patch: EntryPatch): Promise<void>`.
3. The runtime field-strip in `updateEntry` (the destructure of `id`, `userId`, `createdAt` and the three `void _ignored…;` lines) is removed. The `Object.keys(patch).length === 0` short-circuit is preserved. Domain normalization on a patch is preserved.
4. The patch construction site in `EditEntryForm` (`SignedInApp.tsx`) uses `EntryPatch` instead of `Partial<Entry>`. No other behavior change.
5. `npm run compile` is clean. `npm test` is green (no test changes expected — existing `updateEntry` tests still cover the contract).

### Milestone 3: Single-fetch entry model

**Status:** done

## Summary

**What changed**
- `src/lib/storage.ts`: added `getAllEntries()` exporting the per-user list. Deleted `getEntriesForDomain` and `searchEntries`. Updated module doc to reflect the single-fetch model.
- `src/entrypoints/popup/SignedInApp.tsx`: replaced two-fetch logic (separate `loadEntries` + `runSearch` callbacks, two refs, two effects) with one `loadAll`, one `loadIdRef`, one effect. Visible entries now derived via `useMemo` — suggest mode filters to active domain, search mode does case-insensitive substring match. Mutations call `loadAll()`; `handleAdded`'s no-longer-needed `savedDomain` arg is dropped at call site.
- `tests/storage.test.ts`: added `getAllEntries` happy-path + auth-gate tests; relocated the malformed-doc table-driven test under the new describe; deleted the `getEntriesForDomain` and `searchEntries` blocks.
- `tests/components/SignedInApp.test.tsx`: renamed mock to `getAllEntriesMock`; added a StrictMode race-protection test that verifies `loadIdRef` prevents double-render under double-effect-invocation.
- `tests/components/EditDeleteSearch.test.tsx`: renamed mock to `getAllEntriesMock`; reshaped the three Cross-domain search tests to seed the union of suggest- and search-mode entries (single fetch covers both views).

**Key design decisions**
- `handleAdded` now takes no arg: under the single-fetch model, the saved entry's domain doesn't drive the refresh (`loadAll()` is unconditional). The remaining `(domain: string) => void | Promise<void>` signature on `AddEntryForm`'s `onSaved` is left untouched here — it'll go away in M4 when forms unify.

**Reviewer outcome:** APPROVE-with-fixes-applied. Reviewer flagged that StrictMode race protection wasn't covered by tests — added a dedicated test. Two other concerns (initial-load vs. background-refresh loading state, tightening malformed-doc message) were skipped as out of plan scope.

**Goal:** Replace the two-fetch model (one `getEntriesForDomain` per popup open, plus one `searchEntries` per keystroke) with one `getAllEntries` on mount + client-side filtering for both suggest and search modes. Drops Firestore reads to one per popup open and removes the duplicated load/race code.

**Acceptance criteria:**

1. `src/lib/storage.ts` exports a new `getAllEntries(): Promise<Entry[]>`. It runs `query(collection(db, "entries"), where("userId", "==", uid))` and maps results through `toEntry`. It throws when no user is signed in. New tests in `tests/storage.test.ts` cover the happy path and the auth-gate.
2. `getEntriesForDomain` and `searchEntries` are deleted from `storage.ts` along with their tests.
3. `SignedInApp.tsx` is migrated:
   - Single `allEntries: Entry[]` state, single `loadAll()` callback, single `loadIdRef` for race protection.
   - Visible entries are derived via `useMemo`:
     - Suggest mode (no query): `allEntries.filter(e => activeDomain && e.domain === activeDomain)`.
     - Search mode: `allEntries.filter(e => e.domain.toLowerCase().includes(needle))`.
   - After `addEntry`, `updateEntry`, `deleteEntry`, `loadAll()` is called to refresh.
4. The component test files (`SignedInApp.test.tsx`, `EditDeleteSearch.test.tsx`) are updated to mock `getAllEntries` instead of `getEntriesForDomain`/`searchEntries`. Existing assertions about which rows render in suggest vs. search mode pass unchanged.
5. Manual smoke check (described in the per-milestone summary): open popup → suggest mode shows entries for active tab → type query → search filters across all entries → clear → suggest mode again. Single fetch on mount; no per-keystroke fetch.
6. `npm test` is green. `npm run compile` is clean.

### Milestone 4: Form unification + file split

**Status:** done

## Summary

**What changed**
- New `src/entrypoints/popup/EntryForm.tsx` — single component covering add and edit via a discriminated-union props shape. Houses `LoginTypeSuggestions` (the shared datalist) and the local `Field` helper.
- New `src/entrypoints/popup/EntryRow.tsx` — owns `RowMode`, the inline confirm-delete UX, and `relativeTime`. Uses `EntryForm` for the inline edit branch.
- New `src/entrypoints/popup/EntryList.tsx` — thin map over `EntryRow`.
- New `src/entrypoints/popup/computePatch.ts` — pure helper that produces an `EntryPatch` from `(Entry, NewEntry)`, normalizing the domain and trimming string fields before comparison.
- `src/entrypoints/popup/SignedInApp.tsx` slimmed from 603 to ~174 lines: shell, state, sign-out, search input, view derivation. The `AddEntryForm` and `EditEntryForm` definitions are gone.
- New `tests/computePatch.test.ts` — 6 tests covering no-op, single-field change, normalized-domain detect-no-change, normalized-domain emit-change, undefined-original optionals, and trim semantics.

**Key design decisions**
- **Discriminated-union props for `EntryForm`** instead of the plan's spec shape (`{ initialEntry?: Entry; … }`). Mutually exclusive `AddProps`/`EditProps` make "add requires `initialDomain`, edit requires `initialEntry`" a compile-time invariant.
- **Dropped the `savedDomain` arg from `onSaved`.** Under M3's single-fetch model `loadAll()` is unconditional, so the arg is dead. The spec's `(savedDomain: string) => …` from M4 AC1 was a spec carryover.
- **`computePatch` lives next to the popup, not in `lib/`.** It's UI form-state shaped (trims, treats undefined optionals as `""`), not a domain primitive.

**Divergences from the plan**
- `onSaved` signature noted above.
- `EntryForm` props include a required `initialDomain` in the add branch (not in the plan's prop list, but follows from the previous `AddEntryForm`).

**Reviewer outcome:** APPROVE. Reviewer flagged the two divergences above (with concurrence on the rationale) and a trim-redundancy observation between `computePatch` and `storage.updateEntry` — left as-is since both layers' trims are idempotent and consolidating them is out of scope.

**Goal:** Collapse `AddEntryForm` and `EditEntryForm` into one `EntryForm` with a pure-function `computePatch` helper, then split `SignedInApp.tsx` into focused per-component files. Pure refactor — tests pin the contract.

**Acceptance criteria:**

1. A new `EntryForm` component accepts `{ initialEntry?: Entry; onCancel: () => void; onSaved: (savedDomain: string) => void | Promise<void> }`. When `initialEntry` is provided it operates in edit mode (computes patch via `computePatch`, calls `updateEntry`); otherwise it operates in add mode (calls `addEntry` with a `NewEntry`). The login-type datalist hoisted in M1 continues to satisfy the form's `list="login-type-suggestions"` reference.
2. A pure `computePatch(original: Entry, draft: NewEntry): EntryPatch` helper is extracted with unit tests covering: no changes → empty patch; single field changed → patch contains only that field; domain field is normalized via `normalizeDomain`.
3. The popup is split into focused files:
   - `src/entrypoints/popup/EntryForm.tsx`
   - `src/entrypoints/popup/EntryRow.tsx` (with the `RowMode` type and inline confirm-delete UX)
   - `src/entrypoints/popup/EntryList.tsx`
   - `src/entrypoints/popup/SignedInApp.tsx` becomes the shell + state + sign-out.
   - `Field` and `relativeTime` move with their primary consumer (or to a small `format.ts` if shared).
4. Existing component tests (`SignedInApp.test.tsx`, `EditDeleteSearch.test.tsx`) pass without changes — labels, roles, and behavior preserved.
5. `npm test` is green. `npm run compile` is clean.
