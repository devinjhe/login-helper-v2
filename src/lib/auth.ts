import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./firebase";

/**
 * The single source of "who is signed in" for components. Returns `loading: true`
 * until Firebase has resolved the persisted auth state on first mount, then
 * tracks the live user via `onAuthStateChanged`.
 */
export function useAuthUser(): { user: User | null; loading: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (next) => {
      setUser(next);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return { user, loading };
}
