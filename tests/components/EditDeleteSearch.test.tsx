import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Entry } from "@/lib/types";

const {
  getActiveTabDomainMock,
  getAllEntriesMock,
  addEntryMock,
  updateEntryMock,
  deleteEntryMock,
  signOutMock,
} = vi.hoisted(() => ({
  getActiveTabDomainMock: vi.fn(),
  getAllEntriesMock: vi.fn(),
  addEntryMock: vi.fn(),
  updateEntryMock: vi.fn(),
  deleteEntryMock: vi.fn(),
  signOutMock: vi.fn(),
}));

// Partial mock: only `getActiveTabDomain` hits chrome.tabs and must be faked.
// `normalizeDomain` / `normalizeText` are pure — use the real implementations.
vi.mock("@/lib/domain", async (orig) => ({
  ...(await orig<typeof import("@/lib/domain")>()),
  getActiveTabDomain: getActiveTabDomainMock,
}));
vi.mock("@/lib/storage", () => ({
  getAllEntries: getAllEntriesMock,
  addEntry: addEntryMock,
  updateEntry: updateEntryMock,
  deleteEntry: deleteEntryMock,
  // Saved logins are loaded on mount; default to an empty list.
  getSavedLogins: vi.fn(async () => []),
  addSavedLogin: vi.fn(),
  deleteSavedLogin: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({
  signOutCurrentUser: signOutMock,
  signInWithGoogle: vi.fn(),
  auth: {},
  db: {},
}));

import { SignedInApp } from "@/entrypoints/popup/SignedInApp";

const fakeUser = { uid: "u1", email: "me@example.com" };

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: overrides.id ?? "e1",
    domain: overrides.domain ?? "github.com",
    loginType: overrides.loginType ?? "Google",
    loginDetail: overrides.loginDetail,
    notes: overrides.notes,
    userId: "u1",
    createdAt: overrides.createdAt ?? Date.now(),
    updatedAt: overrides.updatedAt ?? Date.now(),
  };
}

beforeEach(() => {
  getActiveTabDomainMock.mockReset();
  getAllEntriesMock.mockReset();
  addEntryMock.mockReset();
  updateEntryMock.mockReset();
  deleteEntryMock.mockReset();
  signOutMock.mockReset();
});

describe("Edit", () => {
  it("opens an inline edit form pre-filled with the row's current values", async () => {
    getActiveTabDomainMock.mockResolvedValueOnce("github.com");
    getAllEntriesMock.mockResolvedValueOnce([
      entry({
        id: "e1",
        domain: "github.com",
        loginType: "Google",
        loginDetail: "me@x",
        notes: "personal",
      }),
    ]);

    render(<SignedInApp user={fakeUser as any} />);
    await userEvent.click(await screen.findByRole("button", { name: /^edit$/i }));

    // Use the form's own Domain label (not the search input's "Search entries" aria-label).
    expect(screen.getByLabelText(/^domain$/i)).toHaveValue("github.com");
    // Login type is a Radix Select (combobox), so its current value shows as text.
    expect(screen.getByRole("combobox", { name: /login type/i })).toHaveTextContent("Google");
    expect(screen.getByLabelText(/login detail/i)).toHaveValue("me@x");
    expect(screen.getByLabelText(/notes/i)).toHaveValue("personal");
  });

  it("calls updateEntry with only changed fields and reloads on save", async () => {
    getActiveTabDomainMock.mockResolvedValueOnce("github.com");
    getAllEntriesMock.mockResolvedValueOnce([
      entry({
        id: "e1",
        domain: "github.com",
        loginType: "Google",
        loginDetail: "me@x",
        notes: "personal",
      }),
    ]);
    updateEntryMock.mockResolvedValueOnce(undefined);
    getAllEntriesMock.mockResolvedValueOnce([
      entry({
        id: "e1",
        domain: "github.com",
        loginType: "Google",
        loginDetail: "me@x",
        notes: "updated",
      }),
    ]);

    render(<SignedInApp user={fakeUser as any} />);
    await userEvent.click(await screen.findByRole("button", { name: /^edit$/i }));
    const notes = screen.getByLabelText(/notes/i);
    await userEvent.clear(notes);
    await userEvent.type(notes, "updated");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(updateEntryMock).toHaveBeenCalledTimes(1));
    expect(updateEntryMock).toHaveBeenCalledWith("e1", { notes: "updated" });
    // After save, list should be visible again with the updated row.
    expect(await screen.findByText(/updated/)).toBeInTheDocument();
  });

  it("offers the predefined login types (incl. Other) in the edit form dropdown", async () => {
    getActiveTabDomainMock.mockResolvedValueOnce("github.com");
    getAllEntriesMock.mockResolvedValueOnce([
      entry({ id: "e1", domain: "github.com", loginType: "Google" }),
    ]);

    render(<SignedInApp user={fakeUser as any} />);
    await userEvent.click(await screen.findByRole("button", { name: /^edit$/i }));

    // The login type is a Radix Select; opening it lists every predefined type.
    await userEvent.click(screen.getByRole("combobox", { name: /login type/i }));
    for (const type of ["Google", "GitHub", "Apple", "Email", "Username", "SSO", "Other"]) {
      expect(screen.getByRole("option", { name: type })).toBeInTheDocument();
    }
  });

  it("preserves a legacy login type when editing only other fields", async () => {
    // An older entry may hold a loginType outside the predefined list. Editing
    // an unrelated field must not rewrite loginType (the Select injects the
    // legacy value as an option; computePatch yields no loginType change).
    getActiveTabDomainMock.mockResolvedValueOnce("github.com");
    getAllEntriesMock.mockResolvedValue([
      entry({ id: "e1", domain: "github.com", loginType: "Okta", notes: "before" }),
    ]);
    updateEntryMock.mockResolvedValueOnce(undefined);

    render(<SignedInApp user={fakeUser as any} />);
    await userEvent.click(await screen.findByRole("button", { name: /^edit$/i }));

    // The legacy value is shown and preserved on the trigger.
    expect(screen.getByRole("combobox", { name: /login type/i })).toHaveTextContent("Okta");
    const notes = screen.getByLabelText(/notes/i);
    await userEvent.clear(notes);
    await userEvent.type(notes, "after");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(updateEntryMock).toHaveBeenCalledTimes(1));
    // Patch carries only the changed notes — loginType is untouched.
    expect(updateEntryMock).toHaveBeenCalledWith("e1", { notes: "after" });
  });

  it("shows an error alert and keeps the form open when updateEntry rejects", async () => {
    getActiveTabDomainMock.mockResolvedValueOnce("github.com");
    getAllEntriesMock.mockResolvedValueOnce([
      entry({ id: "e1", domain: "github.com", loginType: "Google", notes: "before" }),
    ]);
    updateEntryMock.mockRejectedValueOnce(new Error("network down"));

    render(<SignedInApp user={fakeUser as any} />);
    await userEvent.click(await screen.findByRole("button", { name: /^edit$/i }));
    const notes = screen.getByLabelText(/notes/i);
    await userEvent.clear(notes);
    await userEvent.type(notes, "updated");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/network down/);
    // Form is still open (Save button present), not collapsed back to the row.
    expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument();
  });

  it("does not call updateEntry for a cosmetic-only domain edit", async () => {
    getActiveTabDomainMock.mockResolvedValueOnce("github.com");
    getAllEntriesMock.mockResolvedValue([
      entry({ id: "e1", domain: "github.com", loginType: "Google" }),
    ]);

    render(<SignedInApp user={fakeUser as any} />);
    await userEvent.click(await screen.findByRole("button", { name: /^edit$/i }));
    // Retype the domain in a different case — normalizeDomain collapses it back
    // to "github.com", so computePatch yields an empty patch and no write fires.
    const domain = screen.getByLabelText(/^domain$/i);
    await userEvent.clear(domain);
    await userEvent.type(domain, "GITHUB.COM");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(getAllEntriesMock).toHaveBeenCalled());
    expect(updateEntryMock).not.toHaveBeenCalled();
  });

  it("restores the row on cancel without calling updateEntry", async () => {
    getActiveTabDomainMock.mockResolvedValueOnce("github.com");
    getAllEntriesMock.mockResolvedValueOnce([
      entry({ id: "e1", loginType: "Google", loginDetail: "me@x", notes: "before" }),
    ]);

    render(<SignedInApp user={fakeUser as any} />);
    await userEvent.click(await screen.findByRole("button", { name: /^edit$/i }));
    await userEvent.clear(screen.getByLabelText(/notes/i));
    await userEvent.type(screen.getByLabelText(/notes/i), "scratch");
    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(updateEntryMock).not.toHaveBeenCalled();
    // Original "before" note is still visible; "scratch" is not.
    expect(screen.getByText(/before/)).toBeInTheDocument();
    expect(screen.queryByText(/scratch/)).not.toBeInTheDocument();
  });
});

describe("Delete", () => {
  it("requires a two-step confirmation before calling deleteEntry", async () => {
    getActiveTabDomainMock.mockResolvedValueOnce("github.com");
    getAllEntriesMock.mockResolvedValueOnce([
      entry({ id: "e1", loginType: "Google" }),
    ]);
    deleteEntryMock.mockResolvedValueOnce(undefined);
    getAllEntriesMock.mockResolvedValueOnce([]);

    render(<SignedInApp user={fakeUser as any} />);
    await userEvent.click(await screen.findByRole("button", { name: /^delete$/i }));

    // First click opens confirmation, does NOT delete.
    expect(deleteEntryMock).not.toHaveBeenCalled();
    // Confirmation strip has a "Confirm delete" (or similar) button — match
    // a button labelled "Delete" inside an alertdialog/confirm region.
    const confirm = await screen.findByRole("button", { name: /confirm delete/i });
    await userEvent.click(confirm);

    await waitFor(() => expect(deleteEntryMock).toHaveBeenCalledWith("e1"));
    expect(await screen.findByText(/no entries for github\.com/i)).toBeInTheDocument();
  });

  it("shows an error alert and keeps the row when deleteEntry rejects", async () => {
    getActiveTabDomainMock.mockResolvedValueOnce("github.com");
    getAllEntriesMock.mockResolvedValueOnce([
      entry({ id: "e1", loginType: "Google" }),
    ]);
    deleteEntryMock.mockRejectedValueOnce(new Error("delete blocked"));

    render(<SignedInApp user={fakeUser as any} />);
    await userEvent.click(await screen.findByRole("button", { name: /^delete$/i }));
    await userEvent.click(await screen.findByRole("button", { name: /confirm delete/i }));

    await waitFor(() => expect(deleteEntryMock).toHaveBeenCalledWith("e1"));
    // Error surfaces and the row survives (mode reset to view, not removed).
    expect(await screen.findByRole("alert")).toHaveTextContent(/delete blocked/);
    expect(screen.getByText("Google")).toBeInTheDocument();
  });

  it("does not delete if the user cancels the confirmation", async () => {
    getActiveTabDomainMock.mockResolvedValueOnce("github.com");
    getAllEntriesMock.mockResolvedValueOnce([
      entry({ id: "e1", loginType: "Google" }),
    ]);

    render(<SignedInApp user={fakeUser as any} />);
    await userEvent.click(await screen.findByRole("button", { name: /^delete$/i }));
    await userEvent.click(await screen.findByRole("button", { name: /^cancel$/i }));

    expect(deleteEntryMock).not.toHaveBeenCalled();
    expect(screen.getByText("Google")).toBeInTheDocument();
  });
});

describe("All tab + cross-field search", () => {
  it("browses every entry on the All tab and filters within it by search", async () => {
    getActiveTabDomainMock.mockResolvedValueOnce("github.com");
    // Single fetch covers both the active-domain "This site" tab and the "All"
    // tab; search filters within whichever tab is active.
    getAllEntriesMock.mockResolvedValue([
      entry({ id: "e1", domain: "github.com", loginType: "Google" }),
      entry({ id: "x1", domain: "gitlab.com", loginType: "Email" }),
      entry({ id: "z1", domain: "amazon.com", loginType: "SSO" }),
    ]);

    render(<SignedInApp user={fakeUser as any} />);
    // "This site" (default) shows only github.com's entry.
    await screen.findByText(/entries for/i);
    expect(screen.queryByText("Email")).not.toBeInTheDocument();
    expect(screen.queryByText("SSO")).not.toBeInTheDocument();

    // Switch to All — every entry is listed.
    await userEvent.click(screen.getByRole("tab", { name: /^all$/i }));
    expect(await screen.findByText(/all saved logins/i)).toBeInTheDocument();
    expect(screen.getByText("Google")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("SSO")).toBeInTheDocument();

    // Search "git" within All filters to github.com + gitlab.com.
    const box = screen.getByRole("searchbox", { name: /search/i });
    await userEvent.type(box, "git");
    expect(screen.getByText("Google")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.queryByText("SSO")).not.toBeInTheDocument();

    // Clear -> All tab shows everything again.
    await userEvent.clear(box);
    expect(await screen.findByText("SSO")).toBeInTheDocument();
  });

  it("sorts the All tab by domain, then most-recently-updated within a domain", async () => {
    getActiveTabDomainMock.mockResolvedValueOnce("github.com");
    // Out-of-order input: two amazon.com entries (older first) and a github one.
    // Expected order: amazon.com (newer, then older), then github.com.
    getAllEntriesMock.mockResolvedValue([
      entry({ id: "g1", domain: "github.com", loginType: "GitHubLogin", updatedAt: 100 }),
      entry({ id: "a-old", domain: "amazon.com", loginType: "AmazonOld", updatedAt: 1 }),
      entry({ id: "a-new", domain: "amazon.com", loginType: "AmazonNew", updatedAt: 2 }),
    ]);

    render(<SignedInApp user={fakeUser as any} />);
    await userEvent.click(await screen.findByRole("tab", { name: /^all$/i }));

    // The login type is the row title; read them in DOM order.
    const titles = (await screen.findAllByText(/Amazon(Old|New)|GitHubLogin/)).map(
      (el) => el.textContent,
    );
    expect(titles).toEqual(["AmazonNew", "AmazonOld", "GitHubLogin"]);
  });

  it("searches across non-domain fields (login detail)", async () => {
    getActiveTabDomainMock.mockResolvedValueOnce("github.com");
    getAllEntriesMock.mockResolvedValue([
      entry({ id: "e1", domain: "github.com", loginType: "Google", loginDetail: "me@home.test" }),
      entry({ id: "x1", domain: "gitlab.com", loginType: "Email", loginDetail: "work@corp.test" }),
    ]);

    render(<SignedInApp user={fakeUser as any} />);
    await userEvent.click(await screen.findByRole("tab", { name: /^all$/i }));

    // Matching by an email fragment surfaces the gitlab entry, not the github one.
    await userEvent.type(screen.getByRole("searchbox", { name: /search/i }), "corp");
    expect(await screen.findByText("work@corp.test")).toBeInTheDocument();
    expect(screen.queryByText("me@home.test")).not.toBeInTheDocument();
  });

  it("supports delete on rows in the All tab", async () => {
    getActiveTabDomainMock.mockResolvedValueOnce("github.com");
    // Active domain has nothing; the gitlab entry is reachable via the All tab.
    getAllEntriesMock
      .mockResolvedValueOnce([entry({ id: "x1", domain: "gitlab.com", loginType: "Email" })])
      .mockResolvedValueOnce([]);
    deleteEntryMock.mockResolvedValueOnce(undefined);

    render(<SignedInApp user={fakeUser as any} />);
    await userEvent.click(await screen.findByRole("tab", { name: /^all$/i }));

    await userEvent.click(await screen.findByRole("button", { name: /^delete$/i }));
    await userEvent.click(await screen.findByRole("button", { name: /confirm delete/i }));

    await waitFor(() => expect(deleteEntryMock).toHaveBeenCalledWith("x1"));
  });

  it("supports edit on rows in the All tab", async () => {
    getActiveTabDomainMock.mockResolvedValueOnce("github.com");
    getAllEntriesMock.mockResolvedValue([
      entry({ id: "x1", domain: "gitlab.com", loginType: "Email", loginDetail: "me@gl" }),
    ]);
    updateEntryMock.mockResolvedValueOnce(undefined);

    render(<SignedInApp user={fakeUser as any} />);
    await userEvent.click(await screen.findByRole("tab", { name: /^all$/i }));

    await userEvent.click(await screen.findByRole("button", { name: /^edit$/i }));
    await userEvent.type(screen.getByLabelText(/notes/i), "via SSO");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(updateEntryMock).toHaveBeenCalledWith("x1", { notes: "via SSO" }));
  });
});

describe("Tab switching", () => {
  it("closes an open add form when a tab is clicked", async () => {
    getActiveTabDomainMock.mockResolvedValueOnce("github.com");
    getAllEntriesMock.mockResolvedValue([entry({ id: "e1", domain: "github.com" })]);

    render(<SignedInApp user={fakeUser as any} />);
    await userEvent.click(await screen.findByRole("button", { name: /add entry/i }));
    // Form is open (its Domain field is present).
    expect(screen.getByLabelText(/^domain$/i)).toBeInTheDocument();

    // Clicking a tab abandons the form and returns to the list.
    await userEvent.click(screen.getByRole("tab", { name: /^all$/i }));
    expect(screen.queryByLabelText(/^domain$/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add entry/i })).toBeInTheDocument();
  });
});

describe("Form dropdown coexistence", () => {
  it("closes the saved-login dropdown when the login-type Select opens", async () => {
    // Both dropdowns live in the same form. Opening the Radix login-type Select
    // (which portals out and grabs focus) must not leave the saved-login list
    // hanging open underneath it.
    getActiveTabDomainMock.mockResolvedValueOnce("github.com");
    getAllEntriesMock.mockResolvedValue([entry({ id: "e1", domain: "github.com" })]);

    render(<SignedInApp user={fakeUser as any} />);
    await userEvent.click(await screen.findByRole("button", { name: /add entry/i }));

    // Open the saved-login dropdown.
    await userEvent.click(screen.getByRole("button", { name: /show saved logins/i }));
    // With no saved logins and an empty field there are no rows, so the "save"
    // affordance won't show either; type a value to force the list open.
    await userEvent.type(screen.getByLabelText(/login detail/i), "me@x.com");
    expect(screen.getByRole("listbox", { name: /saved logins/i })).toBeInTheDocument();

    // Opening the login-type Select should dismiss the saved-login list.
    await userEvent.click(screen.getByRole("combobox", { name: /login type/i }));
    await waitFor(() =>
      expect(screen.queryByRole("listbox", { name: /saved logins/i })).not.toBeInTheDocument(),
    );
  });
});
