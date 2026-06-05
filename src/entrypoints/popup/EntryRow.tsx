import { useState } from "react";
import { deleteEntry } from "@/lib/storage";
import type { Entry } from "@/lib/types";
import { EntryForm } from "./EntryForm";

type RowMode = "view" | "edit" | "confirmDelete";

export function EntryRow({
  entry,
  onChanged,
  showDomain,
}: {
  entry: Entry;
  onChanged: () => Promise<void> | void;
  showDomain: boolean;
}) {
  const [mode, setMode] = useState<RowMode>("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (mode === "edit") {
    return (
      <li className="p-2">
        <EntryForm
          initialEntry={entry}
          onCancel={() => setMode("view")}
          onSaved={async () => {
            setMode("view");
            await onChanged();
          }}
        />
      </li>
    );
  }

  return (
    <li className="p-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-slate-900">{entry.loginType}</span>
        <span className="text-xs text-slate-500">{relativeTime(entry.createdAt)}</span>
      </div>
      {showDomain ? (
        <p className="mt-0.5 truncate text-xs text-slate-500">{entry.domain}</p>
      ) : null}
      {entry.loginDetail ? (
        <p className="mt-0.5 truncate text-slate-700">{entry.loginDetail}</p>
      ) : null}
      {entry.notes ? <p className="mt-0.5 text-xs text-slate-500">{entry.notes}</p> : null}

      {error ? (
        <p role="alert" className="mt-1 text-xs text-rose-700">
          {error}
        </p>
      ) : null}

      {mode === "view" ? (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("edit")}
            className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setMode("confirmDelete");
            }}
            className="rounded border border-rose-300 px-2 py-0.5 text-xs text-rose-700 hover:bg-rose-50"
          >
            Delete
          </button>
        </div>
      ) : (
        <div
          role="alertdialog"
          aria-labelledby={`delete-prompt-${entry.id}`}
          className="mt-2 flex items-center gap-2 rounded border border-rose-200 bg-rose-50 p-1"
        >
          <span id={`delete-prompt-${entry.id}`} className="text-xs text-rose-800">
            Delete this entry?
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await deleteEntry(entry.id);
                await onChanged();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Delete failed.");
                setMode("view");
              } finally {
                setBusy(false);
              }
            }}
            className="rounded bg-rose-700 px-2 py-0.5 text-xs text-white hover:bg-rose-800 disabled:opacity-60"
          >
            Confirm delete
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode("view")}
            className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      )}
    </li>
  );
}

/**
 * Coarse "x ago" formatter that's good enough for a popup. We don't pull in
 * `date-fns` for one helper.
 */
function relativeTime(epochMs: number): string {
  const diff = Date.now() - epochMs;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  return `${Math.floor(diff / day)}d ago`;
}
