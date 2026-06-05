import { useAuthUser } from "@/lib/auth";
import { signInWithGoogle } from "@/lib/firebase";
import { useState } from "react";
import { SignedInApp } from "./SignedInApp";

/**
 * Popup root. Shows a single Sign-in screen until the user is authenticated,
 * then hands off to `SignedInApp` for the real popup UX.
 */
export function App() {
  const { user, loading } = useAuthUser();

  if (loading) {
    return (
      <main className="w-80 p-4 font-sans text-sm text-slate-900">
        <p className="text-slate-600">Loading…</p>
      </main>
    );
  }

  if (!user) return <SignInScreen />;

  return <SignedInApp user={user} />;
}

function SignInScreen() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSignIn() {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="w-80 p-4 font-sans text-sm text-slate-900">
      <h1 className="text-base font-semibold">Login Helper v2</h1>
      <p className="mt-2 text-slate-600">Sign in with Google to continue.</p>
      <button
        type="button"
        onClick={handleSignIn}
        disabled={busy}
        className="mt-3 w-full rounded bg-slate-900 px-3 py-2 text-white hover:bg-slate-700 disabled:opacity-60"
      >
        {busy ? "Signing in…" : "Sign in with Google"}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-rose-700">
          {error}
        </p>
      ) : null}
    </main>
  );
}
