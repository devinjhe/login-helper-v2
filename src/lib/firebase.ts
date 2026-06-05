import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import { initializeFirestore, type Firestore } from "firebase/firestore";

/**
 * Firebase initialization for the popup.
 *
 * `experimentalForceLongPolling: true` is required because Chrome MV3 service
 * workers can't reliably hold a WebSocket open. Without it, Firestore reads
 * intermittently hang — the symptom is that the popup opens, fires a query, and
 * the spinner never resolves until the worker is reloaded.
 *
 * The same Firebase config is used for runtime (popup) and tests; tests mock
 * the Firebase modules at the boundary, so this file's side effects are inert
 * under Vitest.
 */

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app: FirebaseApp = getApps()[0] ?? initializeApp(firebaseConfig);

// `getAuth` defaults to IndexedDB persistence on web, which survives popup
// close/reopen — that's what makes "sign in once, stay signed in" work without
// any explicit `setPersistence` call.
export const auth: Auth = getAuth(app);
export const db: Firestore = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

/**
 * Performs Google OAuth via the Chrome identity API and exchanges the resulting
 * access token for a Firebase credential. Returns the signed-in `User`.
 *
 * `chrome.identity.getAuthToken` is the right path for Chrome extensions —
 * `signInWithPopup` does not work in the MV3 popup context.
 */
export async function signInWithGoogle(): Promise<User> {
  const token = await getInteractiveAuthToken();
  if (!token) throw new Error("Sign-in failed: no OAuth token returned by Chrome.");
  const credential = GoogleAuthProvider.credential(null, token);
  const result = await signInWithCredential(auth, credential);
  return result.user;
}

/** Signs the current user out of Firebase. */
export async function signOutCurrentUser(): Promise<void> {
  await signOut(auth);
}

/**
 * Promise wrapper around `chrome.identity.getAuthToken({ interactive: true })`.
 * The callback form is used so we can read `chrome.runtime.lastError` — the
 * promise form swallows it on some Chrome versions. Chrome passes the access
 * token as the first callback argument (a string).
 */
function getInteractiveAuthToken(): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      const lastError = chrome.runtime?.lastError;
      if (lastError) {
        reject(new Error(`Sign-in failed: ${lastError.message ?? "unknown chrome.identity error"}`));
        return;
      }
      resolve(typeof token === "string" ? token : undefined);
    });
  });
}
