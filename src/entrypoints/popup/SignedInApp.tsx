import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { getActiveTabDomain } from "@/lib/domain";
import {
  addSavedLogin,
  deleteSavedLogin,
  getAllEntries,
  getSavedLogins,
} from "@/lib/storage";
import { signOutCurrentUser } from "@/lib/firebase";
import { entryMatches } from "@/lib/search";
import type { Entry, SavedLogin } from "@/lib/types";
import { EntryForm } from "./EntryForm";
import { EntryList } from "./EntryList";

/** Which set of entries the list draws from. */
type View = "site" | "all";

/**
 * The signed-in popup view. A tab toggle picks the source list, and the search
 * box filters within whichever tab is active (across all fields):
 *
 *   1. "This site" (default) — entries for the active tab's domain.
 *   2. "All" — every saved login, sorted for stable browsing.
 *
 * Single-fetch model: `getAllEntries()` runs once on mount. Both tabs and the
 * search filter are pure derivations of that list, computed via `useMemo`.
 * Mutations (add/edit/delete) call `loadAll()` to refresh.
 *
 * Component-local state by design: a single screen, no second cross-component
 * shared value. Reach for Zustand only when that changes.
 */
export function SignedInApp({ user }: { user: User }) {
  const [activeDomain, setActiveDomain] = useState<string | null>(null);
  const [allEntries, setAllEntries] = useState<Entry[]>([]);
  const [savedLogins, setSavedLogins] = useState<SavedLogin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [view, setView] = useState<View>("site");
  const [searchQuery, setSearchQuery] = useState("");

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

  // Saved logins load independently of the entry list and its load-id race
  // guard: it's a small secondary list, refreshed on its own mutations.
  const loadSavedLogins = useCallback(async () => {
    try {
      setSavedLogins(await getSavedLogins());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load saved logins.");
    }
  }, []);

  // Persist a new saved login, deduping case-insensitively so the suggestion
  // list doesn't accumulate near-identical values.
  const handleAddSavedLogin = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      if (savedLogins.some((s) => s.value.toLowerCase() === trimmed.toLowerCase())) return;
      try {
        await addSavedLogin(trimmed);
        await loadSavedLogins();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save login.");
      }
    },
    [savedLogins, loadSavedLogins],
  );

  const handleDeleteSavedLogin = useCallback(
    async (id: string) => {
      try {
        await deleteSavedLogin(id);
        await loadSavedLogins();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete saved login.");
      }
    },
    [loadSavedLogins],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const domain = await getActiveTabDomain();
      if (cancelled) return;
      setActiveDomain(domain);
      await Promise.all([loadAll(), loadSavedLogins()]);
    })();
    return () => {
      cancelled = true;
      loadIdRef.current++;
    };
  }, [loadAll, loadSavedLogins]);

  const visibleEntries = useMemo(() => {
    // Source list from the active tab, then filter by the search query (all
    // fields). "All" is sorted by domain then most-recently-updated for stable
    // browsing; "This site" keeps its natural (single-domain) order.
    const source =
      view === "all"
        ? [...allEntries].sort(
            (a, b) => a.domain.localeCompare(b.domain) || b.updatedAt - a.updatedAt,
          )
        : activeDomain
          ? allEntries.filter((e) => e.domain === activeDomain)
          : [];
    return searchQuery.trim() ? source.filter((e) => entryMatches(e, searchQuery)) : source;
  }, [allEntries, activeDomain, view, searchQuery]);

  const handleAdded = async () => {
    setShowAddForm(false);
    await loadAll();
  };

  // Switching tabs always returns to the list — abandoning an open add form,
  // which belongs to the tab the user is leaving.
  const selectView = (next: View) => {
    setShowAddForm(false);
    setView(next);
  };

  return (
    <main className="w-96 p-4 font-sans text-sm text-slate-900">
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          {view === "site" ? (
            activeDomain ? (
              <p className="truncate text-slate-600">
                Entries for <span className="font-semibold text-slate-900">{activeDomain}</span>
              </p>
            ) : (
              <p className="text-slate-600">No active site detected.</p>
            )
          ) : (
            <p className="text-slate-600">All saved logins</p>
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

      <div role="tablist" aria-label="Entry view" className="mt-3 flex gap-1">
        <TabButton selected={view === "site"} onClick={() => selectView("site")}>
          This site
        </TabButton>
        <TabButton selected={view === "all"} onClick={() => selectView("all")}>
          All
        </TabButton>
      </div>

      <input
        type="search"
        aria-label="Search entries"
        placeholder={view === "all" ? "Search all logins…" : "Search this site…"}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="mt-2 w-full rounded border border-slate-300 px-2 py-1"
      />

      {error ? (
        <p role="alert" className="mt-3 rounded border border-rose-200 bg-rose-50 p-2 text-rose-800">
          {error}
        </p>
      ) : null}

      {showAddForm ? (
        <EntryForm
          initialDomain={view === "site" ? (activeDomain ?? "") : ""}
          onCancel={() => setShowAddForm(false)}
          onSaved={handleAdded}
          savedLogins={savedLogins}
          onSaveValue={handleAddSavedLogin}
          onDeleteSaved={handleDeleteSavedLogin}
        />
      ) : (
        <>
          {/* The list scrolls within a capped height so the Add entry button
              below stays pinned in view instead of sitting past a long list. */}
          <div className="mt-3 max-h-80 overflow-y-auto">
            {loading ? (
              <p className="text-slate-500">Loading…</p>
            ) : visibleEntries.length === 0 ? (
              <EmptyState view={view} activeDomain={activeDomain} query={searchQuery} />
            ) : (
              <EntryList
                entries={visibleEntries}
                onChanged={loadAll}
                savedLogins={savedLogins}
                onSaveValue={handleAddSavedLogin}
                onDeleteSaved={handleDeleteSavedLogin}
              />
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="mt-3 w-full rounded bg-slate-900 px-3 py-2 text-white hover:bg-slate-700"
          >
            Add entry
          </button>
        </>
      )}
    </main>
  );
}

function TabButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={
        "rounded px-3 py-1 text-xs font-medium " +
        (selected
          ? "bg-slate-900 text-white"
          : "border border-slate-300 text-slate-700 hover:bg-slate-50")
      }
    >
      {children}
    </button>
  );
}

function EmptyState({
  view,
  activeDomain,
  query,
}: {
  view: View;
  activeDomain: string | null;
  query: string;
}) {
  if (query.trim()) {
    return <p className="text-slate-500">No entries match &quot;{query}&quot;.</p>;
  }
  if (view === "all") {
    return <p className="text-slate-500">No saved logins yet — add one.</p>;
  }
  return (
    <p className="text-slate-500">
      {activeDomain ? `No entries for ${activeDomain} — add one.` : "Add a manual entry."}
    </p>
  );
}
