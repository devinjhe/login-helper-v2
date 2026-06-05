# Backlog — Login Helper v2

Items deliberately deferred during M1–M4 and the post-implementation cleanup
pass. None of these block real use of the extension; they are rough edges and
"nice to have" items identified by reviewers along the way.

Priority cues: **[P2]** = worth doing before real daily use, **[P3]** = nice to
have / revisit when it bites.

## UX rough edges

- **[P3] `relativeTime` for very-old timestamps shows `1500d ago`** rather than a
  date. Fine for a v1 popup; revisit if timestamps older than a year become
  common. The right next step is to switch to `Intl.RelativeTimeFormat` or fall
  back to a locale-formatted date past 90 days. _(Branch coverage of the four
  current buckets now exists in `tests/components/EntryRow.test.tsx`, so this is
  a behavior change, not a coverage gap.)_
- **[P3] No "edit pending changes" warning** when the user types in the edit
  form, then clicks Cancel or hits the Add Entry button. The form is wiped
  silently. Acceptable for a self-use tool; revisit if data-loss complaints
  arise.
- **[P3] No keyboard shortcuts.** Cmd/Ctrl+F to focus search, Esc to close form,
  Enter to confirm delete — all worth adding.

## Data shape / backend

- **[P2] `loginDetail` and `notes` write empty strings rather than omitted keys**
  when the user doesn't fill them. Consistent with the Firestore rules and
  storage layer's normalization, but means every document carries empty strings.
  When the mobile app reads these, treat empty string and missing key the same.
- **[P3] Search filters all entries in memory on every keystroke.** `getAllEntries()`
  runs **once** on mount; both suggest- and search-mode views are derived by a
  synchronous `useMemo` filter over the cached array (`SignedInApp.tsx:67-74`),
  so there is no per-keystroke fetch and no network cost to debounce. The only
  per-keystroke work is an in-memory substring filter, which is negligible for a
  single user's entry count. Revisit only if that client-side filter becomes a
  bottleneck — at which point a server-side index (Algolia/Typesense, or a
  `domainPrefixes` array queried with `array-contains-any`) is the move, likely
  past ~1k entries. _(Supersedes the earlier "debounce per keystroke" item,
  whose premise — a fetch on each keystroke — no longer matches the code.)_

## Test coverage

- **[P2] StrictMode double-render is covered, but out-of-order resolution is
  not.** `tests/components/SignedInApp.test.tsx:108` asserts no duplicate render
  under StrictMode, but resolves every `getAllEntries` call with the same value,
  so it doesn't exercise the `loadIdRef` contract where a *stale* load resolves
  *after* a fresh one. A test that fires two overlapping loads with different
  latencies (stale slower than fresh) and asserts only the fresh result lands
  would lock that contract in.
- **[P2] No emulator-based test for Firestore rules.** Rules are statically
  reviewed but not exercised against the real evaluator. Stand up
  `@firebase/rules-unit-testing` and cover, at minimum:
  - **Cross-uid isolation** — user A cannot read/write/delete user B's docs.
  - **Schema mirror drift** — the `hasOnly`/`hasAll` field lists in
    `firestore.rules` (create) and the `affectedKeys().hasOnly` list (update)
    are a *hand-maintained* copy of the `Entry` shape in `src/lib/types.ts`,
    with no automated link. Because the whole test suite mocks Firebase, a
    mismatch (e.g. adding an `Entry` field but forgetting the rules) passes CI
    and only surfaces as a failed write in production. Assert a valid doc is
    accepted and an unknown extra key is rejected, so adding a field forces a
    rules update. This is the highest-value rules test — add it before, or at
    the moment of, the next `Entry` shape change.
- **[P3] No end-to-end browser test (Playwright).** Plan deliberately scoped this
  out for v1. Worth revisiting if regression cost climbs.

## Mobile-app readiness (future)

- **[P3]** The shared shape lives in `src/lib/types.ts`. When the React Native
  app starts, extract `types.ts`, `domain.ts`, and `storage.ts` into a shared
  package — none of them have web-only dependencies (storage talks to the
  Firestore Web SDK, which has a React Native equivalent at the same import
  path). The popup's components (Tailwind class names) port to NativeWind
  directly.
