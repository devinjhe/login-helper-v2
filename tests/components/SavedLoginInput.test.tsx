import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SavedLoginInput } from "@/entrypoints/popup/SavedLoginInput";
import type { SavedLogin } from "@/lib/types";

function saved(value: string, id = value): SavedLogin {
  return { id, value, userId: "u1", createdAt: 1 };
}

const SAVED = [saved("me@gmail.com"), saved("work@corp.com")];

describe("SavedLoginInput", () => {
  it("lists all saved logins when opened with an empty field", async () => {
    render(
      <SavedLoginInput
        value=""
        onChange={vi.fn()}
        savedLogins={SAVED}
        onSaveValue={vi.fn()}
        onDeleteSaved={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /show saved logins/i }));
    expect(screen.getByRole("option", { name: "me@gmail.com" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "work@corp.com" })).toBeInTheDocument();
  });

  it("filters suggestions by the current substring", async () => {
    render(
      <SavedLoginInput
        value="work"
        onChange={vi.fn()}
        savedLogins={SAVED}
        onSaveValue={vi.fn()}
        onDeleteSaved={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /show saved logins/i }));
    expect(screen.getByRole("option", { name: "work@corp.com" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "me@gmail.com" })).not.toBeInTheDocument();
  });

  it("fills the field when a suggestion is picked", async () => {
    const onChange = vi.fn();
    render(
      <SavedLoginInput
        value=""
        onChange={onChange}
        savedLogins={SAVED}
        onSaveValue={vi.fn()}
        onDeleteSaved={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /show saved logins/i }));
    await userEvent.click(screen.getByRole("option", { name: "me@gmail.com" }));
    expect(onChange).toHaveBeenCalledWith("me@gmail.com");
  });

  it("offers to save a typed value that isn't already saved", async () => {
    const onSaveValue = vi.fn();
    render(
      <SavedLoginInput
        value="new@x.com"
        onChange={vi.fn()}
        savedLogins={SAVED}
        onSaveValue={onSaveValue}
        onDeleteSaved={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /show saved logins/i }));
    await userEvent.click(screen.getByRole("button", { name: /save "new@x\.com"/i }));
    expect(onSaveValue).toHaveBeenCalledWith("new@x.com");
    // Dropdown closes after saving, confirming the action.
    expect(screen.queryByRole("listbox", { name: /saved logins/i })).not.toBeInTheDocument();
  });

  it("does not offer to save a value that already exists (case-insensitive)", async () => {
    render(
      <SavedLoginInput
        value="ME@GMAIL.COM"
        onChange={vi.fn()}
        savedLogins={SAVED}
        onSaveValue={vi.fn()}
        onDeleteSaved={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /show saved logins/i }));
    expect(screen.queryByRole("button", { name: /save "/i })).not.toBeInTheDocument();
  });

  it("deletes a saved login from the list", async () => {
    const onDeleteSaved = vi.fn();
    render(
      <SavedLoginInput
        value=""
        onChange={vi.fn()}
        savedLogins={SAVED}
        onSaveValue={vi.fn()}
        onDeleteSaved={onDeleteSaved}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /show saved logins/i }));
    await userEvent.click(
      screen.getByRole("button", { name: /delete saved login me@gmail\.com/i }),
    );
    expect(onDeleteSaved).toHaveBeenCalledWith("me@gmail.com");
  });
});
