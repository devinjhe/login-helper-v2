# Login Helper v2

A personal-use Chrome extension (Manifest V3) that remembers which login method you use on each website. The popup is gated behind Google sign-in, suggests entries for the active tab's domain, and supports add/edit/delete plus a cross-domain search. Data lives in **Firebase Firestore** keyed to your Google UID, so a future React Native mobile app can read the same data with no migration.

## Stack

- **WXT** — MV3-native extension framework with HMR for popup + background
- **TypeScript + React 19 + Tailwind v4** — components and class names port cleanly to React Native + NativeWind later
- **Firebase Auth (Google sign-in via `chrome.identity`) + Firestore** with `experimentalForceLongPolling: true` for the MV3 service worker
- **Vitest + React Testing Library** for unit tests (Firebase + `chrome.identity` mocked at the boundary)

## Prerequisites (one-time setup)

These all need to be done **before** the extension will build or sign in. The plan and the implementer assume they are already in place.

### 1. Firebase project

Create a new project at <https://console.firebase.google.com>:

- **Firestore Database** → enable, Production mode, region of your choice.
- **Authentication → Sign-in method** → enable **Google** (no anonymous auth).
- **Project settings → Your apps → `</>` (Web)** → register a Web app and copy the `firebaseConfig` snippet.

### 2. Stable extension key + ID

Chrome derives the 32-char extension ID from a base64 RSA public key embedded in the manifest. Generate the keypair locally:

```bash
openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt -out key.pem
openssl rsa -in key.pem -pubout -outform DER 2>/dev/null \
  | openssl base64 -A
```

The base64 string is your `EXTENSION_KEY`. Do **not** commit `key.pem`. To compute the resulting `EXTENSION_ID`:

```bash
openssl rsa -in key.pem -pubout -outform DER 2>/dev/null \
  | sha256sum \
  | head -c 32 \
  | tr 0-9a-f a-p
```

### 3. Google Cloud OAuth client

In the same Firebase project's underlying Google Cloud project: **APIs & Services → Credentials → Create Credentials → OAuth client ID**.

- Application type: **Chrome Extension**
- Application ID: the 32-char `EXTENSION_ID` from step 2

Copy the resulting Client ID — that's `GOOGLE_OAUTH_CLIENT_ID`.

### 4. Firebase CLI

```bash
npm install -g firebase-tools
firebase login
```

Needed for `firebase deploy --only firestore:rules`.

### 5. `.env.local`

Copy `.env.example` to `.env.local` and fill in every value from steps 1–3:

```bash
cp .env.example .env.local
# edit .env.local
```

`.env.local` is gitignored. `EXTENSION_KEY`, `GOOGLE_OAUTH_CLIENT_ID`, and `FIREBASE_PROJECT_ID` are read at build time; the `VITE_FIREBASE_*` values are read at runtime by the popup.

## Build and load

```bash
npm install
npm run build
```

The build folder is `.output/chrome-mv3/`. Load it in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select `.output/chrome-mv3/`

Verify the loaded extension's ID matches `EXTENSION_ID` from `.env.local`. If it doesn't, the OAuth client won't accept the token — recheck step 2.

> **If you ever regenerate `key.pem`**, you must also re-derive `EXTENSION_ID` (step 2 command) and re-register the OAuth client against the new ID (step 3). The build will print a warning if `EXTENSION_KEY` and `EXTENSION_ID` disagree.

## Develop

```bash
npm run dev
```

WXT rebuilds on save. After a change, click the refresh icon on the extension card in `chrome://extensions` and reopen the popup.

## Test

```bash
npm test
```

Vitest runs the unit suite. Component tests use `jsdom`; Firebase, Firestore, and `chrome.identity` are mocked at the module boundary — no live Firebase calls during tests.

## Deploy Firestore security rules

After M2, the repo carries `firestore.rules` enforcing `request.auth.uid == resource.data.userId`. Deploy them with:

```bash
firebase use $FIREBASE_PROJECT_ID
firebase deploy --only firestore:rules
```

## Repo layout (post-M2)

```
src/
  entrypoints/
    popup/        # popup React app
    background.ts # service worker
  lib/
    firebase.ts   # Firebase init + signInWithGoogle / signOutCurrentUser
    auth.ts       # useAuthUser() hook
    storage.ts    # Firestore CRUD + search (only module that talks to Firestore)
    types.ts      # Entry document shape
    domain.ts     # active-tab + normalize helpers
tests/            # Vitest specs
firestore.rules   # deployed Firestore security rules — `firebase deploy --only firestore:rules`
wxt.config.ts     # extension manifest + build config
.env.example      # template for `.env.local` (gitignored)
```
