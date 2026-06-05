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

    // Use the form's own Domain label (not the search input's "Search all domains" aria-label).
    expect(screen.getByLabelText(/^domain$/i)).toHaveValue("github.com");
    expect(screen.getByLabelText(/login type/i)).toHaveValue("Google");
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

  it("exposes the login-type suggestion datalist when the edit form is open", async () => {
    getActiveTabDomainMock.mockResolvedValueOnce("github.com");
    getAllEntriesMock.mockResolvedValueOnce([
      entry({ id: "e1", domain: "github.com", loginType: "Google" }),
    ]);

    const { container } = render(<SignedInApp user={fakeUser as any} />);
    await userEvent.click(await screen.findByRole("button", { name: /^edit$/i }));

    // The login-type input must reference the same datalist id, and the
    // datalist must actually be in the DOM (the bug was that it lived inside
    // AddEntryForm only — empty when only the edit form was mounted).
    const loginTypeInput = screen.getByLabelText(/login type/i) as HTMLInputElement;
    expect(loginTypeInput.getAttribute("list")).toBe("login-type-suggestions");

    const datalist = container.querySelector("#login-type-suggestions");
    expect(datalist).not.toBeNull();
    const optionValues = Array.from(datalist!.querySelectorAll("option")).map((o) =>
      (o as HTMLOptionElement).value,
    );
    expect(optionValues).toEqual(
      expect.arrayContaining(["Google", "GitHub", "Apple", "Email", "Username", "SSO"]),
    );
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

describe("Cross-domain search", () => {
  it("swaps to search results when the search box has text, and back when cleared", async () => {
    getActiveTabDomainMock.mockResolvedValueOnce("github.com");
    // Single fetch covers both suggest mode (filter to active domain) and
    // search mode (substring filter across all entries).
    getAllEntriesMock.mockResolvedValue([
      entry({ id: "e1", domain: "github.com", loginType: "Google" }),
      entry({ id: "x1", domain: "gitlab.com", loginType: "Email" }),
      entry({ id: "z1", domain: "amazon.com", loginType: "SSO" }),
    ]);

    render(<SignedInApp user={fakeUser as any} />);
    await screen.findByText(/entries for/i);

    const box = screen.getByRole("searchbox", { name: /search/i });
    await userEvent.type(box, "git");

    expect(await screen.findByText(/search results for/i)).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    // amazon.com excluded from "git" search; github.com Google still visible.
    expect(screen.getAllByText("Google")).toHaveLength(1);
    expect(screen.queryByText("SSO")).not.toBeInTheDocument();

    // Clear -> back to suggest view.
    await userEvent.clear(box);
    expect(await screen.findByText(/entries for/i)).toBeInTheDocument();
    expect(screen.queryByText(/search results for/i)).not.toBeInTheDocument();
    // Suggest mode shows only github.com (active domain).
    expect(screen.queryByText("Email")).not.toBeInTheDocument();
    expect(screen.queryByText("SSO")).not.toBeInTheDocument();
  });

  it("supports delete on rows in search results", async () => {
    getActiveTabDomainMock.mockResolvedValueOnce("github.com");
    // Active domain has nothing; search "git" surfaces gitlab.com.
    getAllEntriesMock
      .mockResolvedValueOnce([entry({ id: "x1", domain: "gitlab.com", loginType: "Email" })])
      .mockResolvedValueOnce([]);
    deleteEntryMock.mockResolvedValueOnce(undefined);

    render(<SignedInApp user={fakeUser as any} />);

    const box = await screen.findByRole("searchbox", { name: /search/i });
    await userEvent.type(box, "git");
    await screen.findByText(/search results for/i);

    await userEvent.click(await screen.findByRole("button", { name: /^delete$/i }));
    await userEvent.click(await screen.findByRole("button", { name: /confirm delete/i }));

    await waitFor(() => expect(deleteEntryMock).toHaveBeenCalledWith("x1"));
  });

  it("supports edit on rows in search results", async () => {
    getActiveTabDomainMock.mockResolvedValueOnce("github.com");
    getAllEntriesMock.mockResolvedValue([
      entry({ id: "x1", domain: "gitlab.com", loginType: "Email", loginDetail: "me@gl" }),
    ]);
    updateEntryMock.mockResolvedValueOnce(undefined);

    render(<SignedInApp user={fakeUser as any} />);

    const box = await screen.findByRole("searchbox", { name: /search/i });
    await userEvent.type(box, "git");
    await screen.findByText(/search results for/i);

    await userEvent.click(await screen.findByRole("button", { name: /^edit$/i }));
    await userEvent.type(screen.getByLabelText(/notes/i), "via SSO");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(updateEntryMock).toHaveBeenCalledWith("x1", { notes: "via SSO" }));
  });
});
