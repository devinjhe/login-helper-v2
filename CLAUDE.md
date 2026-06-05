# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal-use Chrome extension (Manifest V3, built with **WXT**) that remembers which login method you use on each website. The popup is gated behind Google sign-in, suggests entries for the active tab's domain, and supports add/edit/delete plus a cross-domain search. Data lives in **Firebase Firestore** keyed to the user's Google UID — the data model is deliberately shareable with a future React Native app on the same account.

## Commands

```bash
npm run dev      # WXT dev server with HMR; output in .output/chrome-mv3/
npm run build    # production build → .output/chrome-mv3/ (load unpacked in chrome://extensions)
npm run compile  # tsc --noEmit type check
npm test         # vitest run (full suite)

npx vitest run tests/storage.test.ts          # single test file
npx vitest run -t "normalizeDomain"           # single test by name
npx vitest                                    # watch mode

firebase deploy --only firestore:rules        # deploy firestore.rules (run `firebase use $FIREBASE_PROJECT_ID` first)
```

`npm run build` and `npm run dev` require a populated `.env.local` (copy from `.env.example`) — `wxt.config.ts` throws if `EXTENSION_KEY` or `GOOGLE_OAUTH_CLIENT_ID` are missing. Tests do **not** need `.env.local`; Firebase is mocked.

## Architecture

**Data flow is one-directional and centralized.** `src/lib/storage.ts` is the *only* module that touches Firestore. Everything else imports from it. Every read/write is scoped to `auth.currentUser.uid`, and the same scoping is enforced server-side by `firestore.rules` (`request.auth.uid == resource.data.userId`). The client rules and `firestore.rules` must stay in sync — if you change the `Entry` shape in `src/lib/types.ts`, update the `hasOnly`/`hasAll` field lists in `firestore.rules`.

**Single-fetch model.** The popup (`SignedInApp.tsx`) calls `getAllEntries()` once on mount and derives both views client-side via `useMemo`:
- *Suggest mode* (default): entries matching the active tab's domain.
- *Search mode* (search box has text): substring match across all domains.

Mutations call `loadAll()` to refetch. This is intentional for single-user / low-thousands of entries — see the comment block in `storage.ts` for when to move to a server-side index.

**Key module map (`src/lib/`):**
- `firebase.ts` — Firebase init + `signInWithGoogle` / `signOutCurrentUser`. Two non-obvious constraints live here: (1) `experimentalForceLongPolling: true` is **required** for the MV3 service worker or Firestore reads hang; (2) sign-in goes through `chrome.identity.getAuthToken` → `signInWithCredential`, **not** `signInWithPopup` (which doesn't work in the MV3 popup).
- `auth.ts` — `useAuthUser()` hook, the single source of "who is signed in".
- `domain.ts` — `normalizeDomain` (lowercase, strip `www.`, accept host or full URL) and `getActiveTabDomain` (reads active tab via `chrome.tabs`).
- `types.ts` — `Entry` document shape and the `NewEntry` / `EntryPatch` derived types. Source of truth for the Firestore schema.

**Popup components (`src/entrypoints/popup/`):** `App.tsx` (auth gate → sign-in screen or `SignedInApp`), `SignedInApp.tsx` (main view), `EntryForm.tsx`, `EntryList.tsx`, `EntryRow.tsx`, `computePatch.ts` (diffs an edited draft against the original to produce a minimal `EntryPatch`; normalizes + trims so cosmetic edits no-op).

**Background (`src/entrypoints/background.ts`)** is a deliberate no-op — exists only so the MV3 manifest carries a `service_worker` field. Sign-in and storage live in the popup.

## Conventions

- **`@/` path alias** maps to `src/` (configured in both `tsconfig.json` and `vitest.config.ts`). Use it for cross-module imports.
- **Tests mock Firebase at the module boundary** — `vi.mock("firebase/firestore" | "firebase/auth" | "firebase/app")` with a mutable `authState.currentUser` holder. No live Firebase calls. Follow the pattern in `tests/storage.test.ts` when adding storage/auth tests.
- **Trimming/normalization happens at the storage boundary** (`storage.ts`) *and* in `computePatch.ts`, so direct future callers (the planned mobile app) stay safe even if they skip the UI layer.
- The extension ID is pinned via the `key` field in the manifest, derived from `EXTENSION_KEY`. If `EXTENSION_KEY` and `EXTENSION_ID` disagree, the build prints a warning (OAuth will fail). React 19 + Tailwind v4 are chosen so components/classes port to React Native + NativeWind later.
