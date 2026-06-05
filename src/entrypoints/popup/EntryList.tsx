import type { Entry } from "@/lib/types";
import { EntryRow } from "./EntryRow";

export function EntryList({
  entries,
  onChanged,
  showDomain,
}: {
  entries: Entry[];
  onChanged: () => Promise<void> | void;
  showDomain: boolean;
}) {
  return (
    <ul className="divide-y divide-slate-200 rounded border border-slate-200">
      {entries.map((e) => (
        <EntryRow key={e.id} entry={e} onChanged={onChanged} showDomain={showDomain} />
      ))}
    </ul>
  );
}
