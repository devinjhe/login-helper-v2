import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Entry } from "@/lib/types";

// ── Firestore mocks ────────────────────────────────────────────────────────
// Simulate just enough of the SDK surface that storage.ts uses. Each call
// records its arguments so tests can assert userId scoping and payload shape.

const addDocMock = vi.fn();
const updateDocMock = vi.fn();
const deleteDocMock = vi.fn();
const getDocsMock = vi.fn();
const queryMock = vi.fn((...args: unknown[]) => ({ __query: args }));
const whereMock = vi.fn((...args: unknown[]) => ({ __where: args }));
const collectionMock = vi.fn((...args: unknown[]) => ({ __collection: args }));
const docMock = vi.fn((...args: unknown[]) => ({ __doc: args }));

vi.mock("firebase/firestore", () => ({
  initializeFirestore: vi.fn(() => ({ name: "fs" })),
  collection: collectionMock,
  doc: docMock,
  addDoc: addDocMock,
  updateDoc: updateDocMock,
  deleteDoc: deleteDocMock,
  getDocs: getDocsMock,
  query: queryMock,
  where: whereMock,
}));

vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
}));

// `auth.currentUser` is what storage.ts gates on. Use a mutable holder so each test can swap it.
const authState: { currentUser: { uid: string } | null } = { currentUser: null };
vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(() => authState),
  signInWithCredential: vi.fn(),
  signOut: vi.fn(),
  GoogleAuthProvider: { credential: vi.fn() },
  onAuthStateChanged: vi.fn(),
}));

beforeEach(() => {
  authState.currentUser = { uid: "user-1" };
  addDocMock.mockReset();
  updateDocMock.mockReset();
  deleteDocMock.mockReset();
  getDocsMock.mockReset();
  queryMock.mockClear();
  whereMock.mockClear();
  collectionMock.mockClear();
  docMock.mockClear();
  vi.resetModules();
});

describe("addEntry", () => {
  it("writes a new doc scoped to the current user with timestamps", async () => {
    addDocMock.mockResolvedValueOnce({ id: "new-id" });
    const { addEntry } = await import("@/lib/storage");

    const result = await addEntry({
      domain: "github.com",
      loginType: "Google",
      loginDetail: "me@example.com",
      notes: "personal",
    });

    expect(addDocMock).toHaveBeenCalledTimes(1);
    const [, payload] = addDocMock.mock.calls[0];
    expect(payload.userId).toBe("user-1");
    expect(payload.domain).toBe("github.com");
    expect(payload.loginType).toBe("Google");
    expect(payload.loginDetail).toBe("me@example.com");
    expect(payload.notes).toBe("personal");
    expect(typeof payload.createdAt).toBe("number");
    expect(typeof payload.updatedAt).toBe("number");

    expect(result.id).toBe("new-id");
    expect(result.userId).toBe("user-1");
  });

  it("throws when there is no signed-in user", async () => {
    authState.currentUser = null;
    const { addEntry } = await import("@/lib/storage");
    await expect(
      addEntry({ domain: "github.com", loginType: "Google" }),
    ).rejects.toThrow(/sign(ed)?[\s-]?in/i);
    expect(addDocMock).not.toHaveBeenCalled();
  });

  it("trims loginType, loginDetail, and notes before persisting", async () => {
    addDocMock.mockResolvedValueOnce({ id: "new-id" });
    const { addEntry } = await import("@/lib/storage");

    await addEntry({
      domain: "github.com",
      loginType: " Google ",
      loginDetail: "  me@x  ",
      notes: "  hi  ",
    });

    const [, payload] = addDocMock.mock.calls[0];
    expect(payload.loginType).toBe("Google");
    expect(payload.loginDetail).toBe("me@x");
    expect(payload.notes).toBe("hi");
  });
});

describe("updateEntry", () => {
  it("calls updateDoc with patched fields plus an updatedAt", async () => {
    updateDocMock.mockResolvedValueOnce(undefined);
    const { updateEntry } = await import("@/lib/storage");
    await updateEntry("doc-1", { notes: "updated" });

    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const [, patch] = updateDocMock.mock.calls[0];
    expect(patch.notes).toBe("updated");
    expect(typeof patch.updatedAt).toBe("number");
    // The EntryPatch type forbids userId at compile time; this asserts the
    // spread doesn't reintroduce it at runtime either.
    expect(patch.userId).toBeUndefined();
  });

  it("throws when there is no signed-in user", async () => {
    authState.currentUser = null;
    const { updateEntry } = await import("@/lib/storage");
    await expect(updateEntry("doc-1", { notes: "x" })).rejects.toThrow(/sign/i);
  });

  it("does not write (or bump updatedAt) for an empty patch", async () => {
    const { updateEntry } = await import("@/lib/storage");
    await updateEntry("doc-1", {});
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it("trims string fields in the patch before writing", async () => {
    updateDocMock.mockResolvedValueOnce(undefined);
    const { updateEntry } = await import("@/lib/storage");
    await updateEntry("doc-1", {
      loginType: " Google ",
      loginDetail: "  me@x  ",
      notes: "  hi  ",
    });

    const [, patch] = updateDocMock.mock.calls[0];
    expect(patch.loginType).toBe("Google");
    expect(patch.loginDetail).toBe("me@x");
    expect(patch.notes).toBe("hi");
  });
});

describe("deleteEntry", () => {
  it("calls deleteDoc with the right doc reference", async () => {
    deleteDocMock.mockResolvedValueOnce(undefined);
    const { deleteEntry } = await import("@/lib/storage");
    await deleteEntry("doc-1");
    expect(deleteDocMock).toHaveBeenCalledTimes(1);
    expect(docMock).toHaveBeenCalledWith(expect.anything(), "entries", "doc-1");
  });

  it("throws when there is no signed-in user", async () => {
    authState.currentUser = null;
    const { deleteEntry } = await import("@/lib/storage");
    await expect(deleteEntry("doc-1")).rejects.toThrow(/sign/i);
  });
});

describe("getAllEntries", () => {
  it("returns every entry for the signed-in user, scoped by userId", async () => {
    const docs = [
      mkDoc("a", { domain: "github.com", loginType: "Google", userId: "user-1", createdAt: 1, updatedAt: 1 }),
      mkDoc("b", { domain: "gitlab.com", loginType: "Email", userId: "user-1", createdAt: 2, updatedAt: 2 }),
      mkDoc("c", { domain: "amazon.com", loginType: "SSO", userId: "user-1", createdAt: 3, updatedAt: 3 }),
    ];
    getDocsMock.mockResolvedValueOnce({ docs });

    const { getAllEntries } = await import("@/lib/storage");
    const result = await getAllEntries();

    expect(whereMock).toHaveBeenCalledWith("userId", "==", "user-1");
    expect(result.map((e: Entry) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("throws when there is no signed-in user", async () => {
    authState.currentUser = null;
    const { getAllEntries } = await import("@/lib/storage");
    await expect(getAllEntries()).rejects.toThrow(/sign/i);
  });

  // Each row drops one required field (or supplies a wrong type) and asserts
  // toEntry rejects. The table-driven shape catches regressions where one of
  // the field checks gets accidentally dropped.
  const malformedDocs: Array<[string, Record<string, unknown>]> = [
    ["userId missing", { domain: "github.com", loginType: "Google", createdAt: 1, updatedAt: 1 }],
    ["domain missing", { loginType: "Google", userId: "user-1", createdAt: 1, updatedAt: 1 }],
    ["loginType missing", { domain: "github.com", userId: "user-1", createdAt: 1, updatedAt: 1 }],
    ["createdAt missing", { domain: "github.com", loginType: "Google", userId: "user-1", updatedAt: 1 }],
    ["updatedAt missing", { domain: "github.com", loginType: "Google", userId: "user-1", createdAt: 1 }],
    ["loginDetail wrong type", { domain: "github.com", loginType: "Google", userId: "user-1", createdAt: 1, updatedAt: 1, loginDetail: 123 }],
    ["notes wrong type", { domain: "github.com", loginType: "Google", userId: "user-1", createdAt: 1, updatedAt: 1, notes: 42 }],
  ];

  it.each(malformedDocs)("throws a clear error for malformed Firestore doc (%s)", async (_label, raw) => {
    getDocsMock.mockResolvedValueOnce({ docs: [{ id: "bad", data: () => raw }] });
    const { getAllEntries } = await import("@/lib/storage");
    await expect(getAllEntries()).rejects.toThrow(/malformed entry/i);
  });
});

function mkDoc(id: string, data: Omit<Entry, "id">) {
  return { id, data: () => data };
}
