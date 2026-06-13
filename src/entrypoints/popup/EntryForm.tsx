import { useState } from "react";
import { normalizeDomain } from "@/lib/domain";
import { addEntry, updateEntry } from "@/lib/storage";
import type { Entry, NewEntry, SavedLogin } from "@/lib/types";
import { computePatch } from "./computePatch";
import { LoginTypeSelect } from "./LoginTypeSelect";
import { SavedLoginInput } from "./SavedLoginInput";

/**
 * Saved-login wiring shared by both form modes. The popup owns the list and the
 * persistence callbacks (which refetch after a change); the form just renders
 * the suggestion dropdown for the login-detail field.
 */
interface SavedLoginProps {
  savedLogins: SavedLogin[];
  onSaveValue: (value: string) => void | Promise<void>;
  onDeleteSaved: (id: string) => void | Promise<void>;
}

interface AddProps extends SavedLoginProps {
  initialEntry?: undefined;
  initialDomain: string;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}

interface EditProps extends SavedLoginProps {
  initialEntry: Entry;
  initialDomain?: undefined;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}

type EntryFormProps = AddProps | EditProps;

/**
 * Single form component covering both Add and Edit. Pass `initialEntry` to
 * edit; pass `initialDomain` to add. Save dispatches to `addEntry` or
 * `updateEntry` (via `computePatch`) accordingly.
 */
export function EntryForm(props: EntryFormProps) {
  const isEdit = props.initialEntry !== undefined;
  // `Required<NewEntry>`: every field is a concrete string here (the edit branch
  // coalesces the optional fields, the add branch seeds them ""), so the form
  // state below needn't re-coalesce.
  const initial: Required<NewEntry> = isEdit
    ? {
        domain: props.initialEntry.domain,
        loginType: props.initialEntry.loginType,
        loginDetail: props.initialEntry.loginDetail ?? "",
        notes: props.initialEntry.notes ?? "",
      }
    : {
        domain: props.initialDomain,
        loginType: "",
        loginDetail: "",
        notes: "",
      };

  const [domain, setDomain] = useState(initial.domain);
  const [loginType, setLoginType] = useState(initial.loginType);
  const [loginDetail, setLoginDetail] = useState(initial.loginDetail);
  const [notes, setNotes] = useState(initial.notes);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Edit form's input ids include the entry id so multiple edit forms (one
  // per row, theoretically) wouldn't collide. Add form uses static ids.
  const idPrefix = isEdit ? `edit-${props.initialEntry.id}` : "add";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);
    setSaveError(null);

    const cleanDomain = normalizeDomain(domain);
    if (!cleanDomain) {
      setValidationError("Domain is required.");
      return;
    }
    if (!loginType.trim()) {
      setValidationError("Login type is required.");
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        const patch = computePatch(props.initialEntry, {
          domain: cleanDomain,
          loginType,
          loginDetail,
          notes,
        });
        if (Object.keys(patch).length > 0) {
          await updateEntry(props.initialEntry.id, patch);
        }
      } else {
        await addEntry({
          domain: cleanDomain,
          loginType: loginType.trim(),
          loginDetail: loginDetail.trim(),
          notes: notes.trim(),
        });
      }
      await props.onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save entry.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className={isEdit ? "space-y-2" : "mt-3 space-y-2"}>
      <Field id={`${idPrefix}-domain`} label="Domain">
        <input
          id={`${idPrefix}-domain`}
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="w-full rounded border border-slate-300 px-2 py-1"
          autoFocus
        />
      </Field>

      <Field id={`${idPrefix}-loginType`} label="Login type">
        <LoginTypeSelect
          id={`${idPrefix}-loginType`}
          ariaLabel="Login type"
          value={loginType}
          onChange={setLoginType}
        />
      </Field>

      <Field id={`${idPrefix}-loginDetail`} label="Login detail">
        <SavedLoginInput
          id={`${idPrefix}-loginDetail`}
          value={loginDetail}
          onChange={setLoginDetail}
          savedLogins={props.savedLogins}
          onSaveValue={props.onSaveValue}
          onDeleteSaved={props.onDeleteSaved}
          placeholder={isEdit ? undefined : "email, username, handle (optional)"}
        />
      </Field>

      <Field id={`${idPrefix}-notes`} label="Notes">
        <textarea
          id={`${idPrefix}-notes`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded border border-slate-300 px-2 py-1"
          placeholder={isEdit ? undefined : "optional"}
        />
      </Field>

      {validationError ? (
        <p className="text-rose-700" role="alert">
          {validationError}
        </p>
      ) : null}
      {saveError ? (
        <p className="text-rose-700" role="alert">
          {saveError}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded bg-slate-900 px-3 py-2 text-white hover:bg-slate-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={props.onCancel}
          disabled={saving}
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className="block">
      <span className="block text-xs font-medium text-slate-700">{label}</span>
      <div className="mt-0.5">{children}</div>
    </label>
  );
}
