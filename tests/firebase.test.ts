import { describe, it, expect, beforeEach, vi } from "vitest";

// Module mocks must be hoisted; vi.mock is hoisted automatically by vitest.
const signInWithCredentialMock = vi.fn();
const signOutMock = vi.fn();
const credentialMock = vi.fn((_idToken: string | null, accessToken: string) => ({
  accessToken,
  providerId: "google.com",
}));

vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
}));

vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(() => ({ name: "[DEFAULT]" })),
  signInWithCredential: signInWithCredentialMock,
  signOut: signOutMock,
  GoogleAuthProvider: {
    credential: credentialMock,
  },
  onAuthStateChanged: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  initializeFirestore: vi.fn(() => ({ name: "fs" })),
}));

describe("signInWithGoogle", () => {
  beforeEach(() => {
    vi.resetModules();
    signInWithCredentialMock.mockReset();
    signOutMock.mockReset();
    credentialMock.mockClear();
    vi.stubGlobal("chrome", {
      identity: {
        getAuthToken: vi.fn(),
      },
    });
  });

  it("requests an interactive token, exchanges it for a Firebase credential, and signs in", async () => {
    (chrome.identity.getAuthToken as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      // chrome.identity.getAuthToken supports both callback and promise APIs;
      // mock the callback shape that the implementation should call.
      (_opts: chrome.identity.TokenDetails, cb: (token?: string) => void) => cb("oauth-token-123"),
    );
    const fakeUser = { uid: "user-1" };
    signInWithCredentialMock.mockResolvedValueOnce({ user: fakeUser });

    const { signInWithGoogle } = await import("@/lib/firebase");
    const user = await signInWithGoogle();

    expect(chrome.identity.getAuthToken).toHaveBeenCalledWith(
      { interactive: true },
      expect.any(Function),
    );
    expect(credentialMock).toHaveBeenCalledWith(null, "oauth-token-123");
    expect(signInWithCredentialMock).toHaveBeenCalledTimes(1);
    expect(user).toBe(fakeUser);
  });

  it("throws a useful error when chrome.identity returns no token", async () => {
    (chrome.identity.getAuthToken as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_opts: chrome.identity.TokenDetails, cb: (token?: string) => void) => {
        // Chrome populates lastError when the user dismisses or denies the prompt.
        // The mock simulates the same — undefined token + lastError set.
        (chrome as unknown as { runtime?: { lastError?: { message: string } } }).runtime = {
          lastError: { message: "user dismissed" },
        };
        cb(undefined);
      },
    );

    const { signInWithGoogle } = await import("@/lib/firebase");
    // Verify the lastError message is propagated, not just a generic "Sign-in failed".
    await expect(signInWithGoogle()).rejects.toThrow(/dismissed/i);
  });
});

describe("signOutCurrentUser", () => {
  beforeEach(() => {
    vi.resetModules();
    signOutMock.mockReset();
  });

  it("calls firebase auth signOut", async () => {
    signOutMock.mockResolvedValueOnce(undefined);
    const { signOutCurrentUser } = await import("@/lib/firebase");
    await signOutCurrentUser();
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });
});
