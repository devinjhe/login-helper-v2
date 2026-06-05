import { describe, it, expect, beforeEach, vi } from "vitest";
import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Entry } from "@/lib/types";

const {
  getActiveTabDomainMock,
  getAllEntriesMock,
  addEntryMock,
  signOutMock,
} = vi.hoisted(() => ({
  getActiveTabDomainMock: vi.fn(),
  getAllEntriesMock: vi.fn(),
  addEntryMock: vi.fn(),
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
  // Real implementations not used by these tests but referenced by the module export.
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
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

describe("SignedInApp — active-domain suggest", () => {
  beforeEach(() => {
    getActiveTabDomainMock.mockReset();
    getAllEntriesMock.mockReset();
    addEntryMock.mockReset();
    signOutMock.mockReset();
  });

  it("loads entries for the active tab's domain on mount", async () => {
    getActiveTabDomainMock.mockResolvedValueOnce("github.com");
    getAllEntriesMock.mockResolvedValueOnce([
      entry({ id: "e1", loginType: "Google", loginDetail: "primary@x.test" }),
      entry({ id: "e2", loginType: "Email", loginDetail: "alt@x.test", notes: "work" }),
    ]);

    render(<SignedInApp user={fakeUser as any} />);

    expect(await screen.findByText(/entries for/i)).toBeInTheDocument();
    expect(screen.getByText("github.com")).toBeInTheDocument();
    expect(await screen.findByText("Google")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("primary@x.test")).toBeInTheDocument();
    expect(screen.getByText("alt@x.test")).toBeInTheDocument();
    expect(screen.getByText("work")).toBeInTheDocument();
  });

  it("shows an empty state when the domain has no entries", async () => {
    getActiveTabDomainMock.mockResolvedValueOnce("example.org");
    getAllEntriesMock.mockResolvedValueOnce([]);

    render(<SignedInApp user={fakeUser as any} />);

    expect(await screen.findByText(/no entries for example\.org/i)).toBeInTheDocument();
  });

  it("renders an error banner when the load fails", async () => {
    getActiveTabDomainMock.mockResolvedValueOnce("github.com");
    getAllEntriesMock.mockRejectedValueOnce(new Error("network down"));

    render(<SignedInApp user={fakeUser as any} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/network down/);
  });

  it("falls back to a friendly message when no active tab domain is detectable", async () => {
    getActiveTabDomainMock.mockResolvedValueOnce(null);

    render(<SignedInApp user={fakeUser as any} />);

    // Without a domain, we still render but offer the user a way to add a manual entry.
    expect(await screen.findByText(/no active site detected/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add entry/i })).toBeInTheDocument();
  });

  it("does not double-render entries under StrictMode (load-id race protection)", async () => {
    // StrictMode in dev intentionally double-invokes effects so we'd see two
    // overlapping `getAllEntries` calls. The loadIdRef bump in the effect's
    // cleanup ensures only the freshest resolve writes state.
    getActiveTabDomainMock.mockResolvedValue("github.com");
    getAllEntriesMock.mockResolvedValue([
      entry({ id: "e1", domain: "github.com", loginType: "Google" }),
    ]);

    render(
      <StrictMode>
        <SignedInApp user={fakeUser as any} />
      </StrictMode>,
    );

    expect(await screen.findByText("Google")).toBeInTheDocument();
    // Exactly one row visible (no duplicated "Google" from double-resolve).
    expect(screen.getAllByText("Google")).toHaveLength(1);
  });
});

describe("SignedInApp — Add entry form", () => {
  beforeEach(() => {
    getActiveTabDomainMock.mockReset();
    getAllEntriesMock.mockReset();
    addEntryMock.mockReset();
    signOutMock.mockReset();
    getActiveTabDomainMock.mockResolvedValue("github.com");
    getAllEntriesMock.mockResolvedValue([]);
  });

  it("pre-fills the active tab's domain in the form", async () => {
    render(<SignedInApp user={fakeUser as any} />);
    await userEvent.click(await screen.findByRole("button", { name: /add entry/i }));

    expect(screen.getByLabelText(/^domain$/i)).toHaveValue("github.com");
  });

  it("blocks submission when domain or loginType are empty", async () => {
    render(<SignedInApp user={fakeUser as any} />);
    await userEvent.click(await screen.findByRole("button", { name: /add entry/i }));

    // Clear pre-filled domain and try to save without filling loginType.
    await userEvent.clear(screen.getByLabelText(/^domain$/i));
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(addEntryMock).not.toHaveBeenCalled();
    expect(screen.getByText(/domain is required/i)).toBeInTheDocument();
  });

  it("blocks submission when loginType is empty even with a valid domain", async () => {
    render(<SignedInApp user={fakeUser as any} />);
    await userEvent.click(await screen.findByRole("button", { name: /add entry/i }));

    // Domain is pre-filled (github.com); leave loginType blank so validation
    // reaches the loginType-required branch (domain check no longer short-circuits).
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(addEntryMock).not.toHaveBeenCalled();
    expect(screen.getByText(/login type is required/i)).toBeInTheDocument();
  });

  it("saves an entry with the active-tab domain when the user does not edit it", async () => {
    addEntryMock.mockResolvedValueOnce(
      entry({ id: "new-1", domain: "github.com", loginType: "Google", loginDetail: "me@x" }),
    );
    // After save, the list reloads — return the new entry.
    getAllEntriesMock.mockResolvedValueOnce([]).mockResolvedValueOnce([
      entry({ id: "new-1", domain: "github.com", loginType: "Google", loginDetail: "me@x" }),
    ]);

    render(<SignedInApp user={fakeUser as any} />);
    await userEvent.click(await screen.findByRole("button", { name: /add entry/i }));

    await userEvent.type(screen.getByLabelText(/login type/i), "Google");
    await userEvent.type(screen.getByLabelText(/login detail/i), "me@x");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(addEntryMock).toHaveBeenCalledTimes(1));
    expect(addEntryMock).toHaveBeenCalledWith({
      domain: "github.com",
      loginType: "Google",
      loginDetail: "me@x",
      notes: "",
    });
  });

  it("saves with a user-edited domain when the user changes the field", async () => {
    addEntryMock.mockResolvedValueOnce(
      entry({ id: "new-1", domain: "intranet.corp", loginType: "SSO" }),
    );
    getAllEntriesMock.mockResolvedValue([]);

    render(<SignedInApp user={fakeUser as any} />);
    await userEvent.click(await screen.findByRole("button", { name: /add entry/i }));

    const domain = screen.getByLabelText(/^domain$/i);
    await userEvent.clear(domain);
    await userEvent.type(domain, "intranet.corp");
    await userEvent.type(screen.getByLabelText(/login type/i), "SSO");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(addEntryMock).toHaveBeenCalledTimes(1));
    expect(addEntryMock.mock.calls[0][0].domain).toBe("intranet.corp");
    expect(addEntryMock.mock.calls[0][0].loginType).toBe("SSO");
  });

  it("returns to the list view when the user clicks Cancel", async () => {
    render(<SignedInApp user={fakeUser as any} />);
    await userEvent.click(await screen.findByRole("button", { name: /add entry/i }));
    expect(screen.getByLabelText(/^domain$/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    // Form gone, list back.
    expect(screen.queryByLabelText(/^domain$/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add entry/i })).toBeInTheDocument();
  });
});

describe("SignedInApp — sign-out", () => {
  it("calls signOutCurrentUser when the sign-out control is activated", async () => {
    getActiveTabDomainMock.mockResolvedValue("github.com");
    getAllEntriesMock.mockResolvedValue([]);
    signOutMock.mockResolvedValueOnce(undefined);

    render(<SignedInApp user={fakeUser as any} />);
    await userEvent.click(await screen.findByRole("button", { name: /sign out/i }));

    expect(signOutMock).toHaveBeenCalledTimes(1);
  });
});
