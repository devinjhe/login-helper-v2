import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { getActiveTabDomain } from "@/lib/domain";
import { getAllEntries } from "@/lib/storage";
import { signOutCurrentUser } from "@/lib/firebase";
import type { Entry } from "@/lib/types";
import { EntryForm, LoginTypeSuggestions } from "./EntryForm";
import { EntryList } from "./EntryList";

/**
 * The signed-in popup view. Two modes coexist:
 *
 *   1. Suggest mode — entries for the active tab's domain. Default view on open.
 *   2. Search mode — when the search box has text, results filter across all
 *      entries by domain substring. Clearing the box returns to suggest mode.
 *
 * Single-fetch model: `getAllEntries()` runs once on mount. Suggest and search
 * views are pure derivations of that list, computed via `useMemo`. Mutations
 * (add/edit/delete) call `loadAll()` to refresh.
 *
 * Component-local state by design: a single screen, no second cross-component
 * shared value. Reach for Zustand only when that changes.
 */
export function SignedInApp({ user }: { user: User }) {
  const [activeDomain, setActiveDomain] = useState<string | null>(null);
  const [allEntries, setAllEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const inSearchMode = searchQuery.trim().length > 0;

  // Monotonic load id. Ensures stale resolves don't clobber fresh state under
  // StrictMode or when a mutation triggers a refresh while one is in flight.
  const loadIdRef = useRef(0);

  const loadAll = useCallback(async () => {
    const myId = ++loadIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const list = await getAllEntries();
      if (loadIdRef.current !== myId) return;
      setAllEntries(list);
    } catch (e) {
      if (loadIdRef.current !== myId) return;
      setError(e instanceof Error ? e.message : "Failed to load entries.");
    } finally {
      if (loadIdRef.current === myId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const domain = await getActiveTabDomain();
      if (cancelled) return;
      setActiveDomain(domain);
      await loadAll();
    })();
    return () => {
      cancelled = true;
      loadIdRef.current++;
    };
  }, [loadAll]);

  const visibleEntries = useMemo(() => {
    if (inSearchMode) {
      const needle = searchQuery.trim().toLowerCase();
      return allEntries.filter((e) => e.domain.toLowerCase().includes(needle));
    }
    if (!activeDomain) return [];
    return allEntries.filter((e) => e.domain === activeDomain);
  }, [allEntries, activeDomain, inSearchMode, searchQuery]);

  const handleAdded = async () => {
    setShowAddForm(false);
    await loadAll();
  };

  return (
    <main className="w-96 p-4 font-sans text-sm text-slate-900">
      <LoginTypeSuggestions />
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          {inSearchMode ? (
            <p className="truncate text-slate-600">
              Search results for{" "}
              <span className="font-semibold text-slate-900">&quot;{searchQuery}&quot;</span>
            </p>
          ) : activeDomain ? (
            <p className="truncate text-slate-600">
              Entries for <span className="font-semibold text-slate-900">{activeDomain}</span>
            </p>
          ) : (
            <p className="text-slate-600">No active site detected.</p>
          )}
          <p className="mt-0.5 truncate text-xs text-slate-500">{user.email ?? user.uid}</p>
        </div>
        <button
          type="button"
          onClick={() => signOutCurrentUser()}
          className="shrink-0 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
        >
          Sign out
        </button>
      </header>

      <input
        type="search"
        aria-label="Search by domain substring"
        placeholder="Search all domains…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="mt-3 w-full rounded border border-slate-300 px-2 py-1"
      />

      {error ? (
        <p role="alert" className="mt-3 rounded border border-rose-200 bg-rose-50 p-2 text-rose-800">
          {error}
        </p>
      ) : null}

      {showAddForm ? (
        <EntryForm
          initialDomain={activeDomain ?? ""}
          onCancel={() => setShowAddForm(false)}
          onSaved={handleAdded}
        />
      ) : (
        <>
          <div className="mt-3">
            {loading ? (
              <p className="text-slate-500">Loading…</p>
            ) : visibleEntries.length === 0 ? (
              <EmptyState inSearchMode={inSearchMode} activeDomain={activeDomain} query={searchQuery} />
            ) : (
              <EntryList entries={visibleEntries} onChanged={loadAll} showDomain={inSearchMode} />
            )}
          </div>
          {!inSearchMode ? (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="mt-3 w-full rounded bg-slate-900 px-3 py-2 text-white hover:bg-slate-700"
            >
              Add entry
            </button>
          ) : null}
        </>
      )}
    </main>
  );
}

function EmptyState({
  inSearchMode,
  activeDomain,
  query,
}: {
  inSearchMode: boolean;
  activeDomain: string | null;
  query: string;
}) {
  if (inSearchMode) {
    return <p className="text-slate-500">No entries match &quot;{query}&quot;.</p>;
  }
  return (
    <p className="text-slate-500">
      {activeDomain ? `No entries for ${activeDomain} — add one.` : "Add a manual entry."}
    </p>
  );
}
