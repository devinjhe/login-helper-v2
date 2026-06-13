import type { Entry, SavedLogin } from "@/lib/types";
import { EntryRow } from "./EntryRow";

export function EntryList({
  entries,
  onChanged,
  savedLogins,
  onSaveValue,
  onDeleteSaved,
}: {
  entries: Entry[];
  onChanged: () => Promise<void> | void;
  // Forwarded to each row's inline edit form for login-detail suggestions.
  savedLogins: SavedLogin[];
  onSaveValue: (value: string) => void | Promise<void>;
  onDeleteSaved: (id: string) => void | Promise<void>;
}) {
  return (
    <ul className="divide-y divide-slate-200 rounded border border-slate-200">
      {entries.map((e) => (
        <EntryRow
          key={e.id}
          entry={e}
          onChanged={onChanged}
          savedLogins={savedLogins}
          onSaveValue={onSaveValue}
          onDeleteSaved={onDeleteSaved}
        />
      ))}
    </ul>
  );
}
