import { useEffect, useRef, useState } from "react";
import type { SavedLogin } from "@/lib/types";

/**
 * Login-detail field: a free-text input plus a dropdown of the user's saved
 * logins (reusable credential values like common emails). Free text is always
 * preserved — the dropdown only *suggests*.
 *
 * Inline management fits the value-only model (no separate screen): each
 * suggestion row has a delete control, and when the current text is a non-empty
 * value not already saved, a "Save" row offers to persist it.
 *
 * Hand-rolled rather than Radix because this is a combobox (type-or-pick), which
 * Radix Select — a strict picker — doesn't cover.
 */
export function SavedLoginInput({
  id,
  value,
  onChange,
  savedLogins,
  onSaveValue,
  onDeleteSaved,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  savedLogins: SavedLogin[];
  onSaveValue: (value: string) => void | Promise<void>;
  onDeleteSaved: (id: string) => void | Promise<void>;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close the dropdown when interaction moves outside the field. We listen for
  // both mousedown and focusin: focusin also covers the case where another
  // overlay (e.g. the Radix login-type Select, which portals out and grabs
  // focus on open) would otherwise swallow the mousedown and leave this list
  // hanging open underneath it.
  useEffect(() => {
    if (!open) return;
    function onOutside(e: Event) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("focusin", onOutside);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("focusin", onOutside);
    };
  }, [open]);

  const trimmed = value.trim();
  // Suggestions filtered by the current substring (case-insensitive). Empty
  // input shows all saved logins so the dropdown is useful before typing.
  const needle = trimmed.toLowerCase();
  const matches = needle
    ? savedLogins.filter((s) => s.value.toLowerCase().includes(needle))
    : savedLogins;
  // Offer to save the typed value when it isn't already a saved login (exact,
  // case-insensitive). Avoids cluttering the list with near-duplicate casing.
  const alreadySaved = savedLogins.some((s) => s.value.toLowerCase() === needle);
  const canSave = trimmed.length > 0 && !alreadySaved;

  return (
    <div ref={containerRef} className="relative">
      <div className="flex">
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          className="w-full rounded-l rounded-r-none border border-r-0 border-slate-300 px-2 py-1"
          placeholder={placeholder}
          autoComplete="off"
        />
        <button
          type="button"
          aria-label="Show saved logins"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 rounded-r border border-slate-300 px-2 text-slate-500 hover:bg-slate-50"
        >
          ▾
        </button>
      </div>

      {open && (matches.length > 0 || canSave) ? (
        <ul
          role="listbox"
          aria-label="Saved logins"
          className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded border border-slate-300 bg-white shadow-md"
        >
          {matches.map((s) => (
            <li key={s.id} className="flex items-center justify-between hover:bg-slate-100">
              <button
                type="button"
                role="option"
                aria-selected={s.value === value}
                onClick={() => {
                  onChange(s.value);
                  setOpen(false);
                }}
                className="flex-1 truncate px-2 py-1 text-left text-slate-900"
              >
                {s.value}
              </button>
              <button
                type="button"
                aria-label={`Delete saved login ${s.value}`}
                onClick={() => onDeleteSaved(s.id)}
                className="shrink-0 px-2 py-1 text-slate-400 hover:text-rose-700"
              >
                ×
              </button>
            </li>
          ))}
          {canSave ? (
            <li className="border-t border-slate-200">
              <button
                type="button"
                onClick={async () => {
                  await onSaveValue(trimmed);
                  // Close so the now-saved value reappears as a suggestion on
                  // reopen — confirming the save instead of leaving the row up.
                  setOpen(false);
                }}
                className="w-full truncate px-2 py-1 text-left text-slate-700 hover:bg-slate-100"
              >
                + Save &quot;{trimmed}&quot;
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
