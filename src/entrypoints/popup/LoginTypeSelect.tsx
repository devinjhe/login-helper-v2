import * as Select from "@radix-ui/react-select";
import { LOGIN_TYPES } from "@/lib/loginTypes";

/**
 * Styled, accessible login-type dropdown built on `@radix-ui/react-select`.
 *
 * Radix is DOM-only — it won't port to React Native, but the data model it
 * feeds (`loginType: string`) stays portable, so an RN app would only need to
 * swap this picker, not the storage layer.
 *
 * The empty string means "nothing chosen yet" (add form): Radix shows the
 * placeholder. A legacy `value` outside `LOGIN_TYPES` (an older free-text entry)
 * is injected as an extra option so editing never silently rewrites stored data.
 */
export function LoginTypeSelect({
  id,
  value,
  onChange,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}) {
  const options: readonly string[] =
    value && !LOGIN_TYPES.includes(value as (typeof LOGIN_TYPES)[number])
      ? [value, ...LOGIN_TYPES]
      : LOGIN_TYPES;

  return (
    // Radix reserves "" (an empty `Select.Item` value throws at runtime) to mean
    // "no selection". Coerce our empty add-form value to undefined so the
    // placeholder renders instead of Radix attempting to match an empty item.
    <Select.Root value={value || undefined} onValueChange={onChange}>
      <Select.Trigger
        id={id}
        aria-label={ariaLabel}
        className="flex w-full items-center justify-between rounded border border-slate-300 px-2 py-1 text-left data-[placeholder]:text-slate-400"
      >
        <Select.Value placeholder="Select a login type…" />
        <Select.Icon className="text-slate-500">▾</Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-60 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded border border-slate-300 bg-white shadow-md"
        >
          <Select.Viewport className="p-1">
            {options.map((opt) => (
              <Select.Item
                key={opt}
                value={opt}
                className="flex cursor-pointer items-center justify-between rounded px-2 py-1 text-slate-900 outline-none data-[highlighted]:bg-slate-100"
              >
                <Select.ItemText>{opt}</Select.ItemText>
                <Select.ItemIndicator className="text-slate-500">✓</Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
