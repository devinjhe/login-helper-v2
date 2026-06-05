import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { User } from "firebase/auth";

const onAuthStateChangedMock = vi.fn();

vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
}));

vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(() => ({ name: "[DEFAULT]" })),
  onAuthStateChanged: onAuthStateChangedMock,
  signInWithCredential: vi.fn(),
  signOut: vi.fn(),
  GoogleAuthProvider: { credential: vi.fn() },
}));

vi.mock("firebase/firestore", () => ({
  initializeFirestore: vi.fn(() => ({ name: "fs" })),
}));

describe("useAuthUser", () => {
  beforeEach(() => {
    vi.resetModules();
    onAuthStateChangedMock.mockReset();
  });

  it("starts as { user: null, loading: true } and resolves to the signed-in user", async () => {
    let emit: (user: User | null) => void = () => {};
    onAuthStateChangedMock.mockImplementation((_auth, listener) => {
      emit = listener;
      return () => {}; // unsubscribe
    });

    const { useAuthUser } = await import("@/lib/auth");
    const { result } = renderHook(() => useAuthUser());

    expect(result.current).toEqual({ user: null, loading: true });

    const fakeUser = { uid: "user-1" } as unknown as User;
    act(() => emit(fakeUser));

    expect(result.current).toEqual({ user: fakeUser, loading: false });
  });

  it("emits null user (not loading) when the user signs out", async () => {
    let emit: (user: User | null) => void = () => {};
    onAuthStateChangedMock.mockImplementation((_auth, listener) => {
      emit = listener;
      return () => {};
    });

    const { useAuthUser } = await import("@/lib/auth");
    const { result } = renderHook(() => useAuthUser());

    act(() => emit(null));
    expect(result.current).toEqual({ user: null, loading: false });
  });

  it("unsubscribes on unmount", async () => {
    const unsub = vi.fn();
    onAuthStateChangedMock.mockImplementation(() => unsub);

    const { useAuthUser } = await import("@/lib/auth");
    const { unmount } = renderHook(() => useAuthUser());
    unmount();
    expect(unsub).toHaveBeenCalledTimes(1);
  });
});
