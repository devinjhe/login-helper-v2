import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { useAuthUserMock, signInWithGoogleMock } = vi.hoisted(() => ({
  useAuthUserMock: vi.fn(),
  signInWithGoogleMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ useAuthUser: useAuthUserMock }));
vi.mock("@/lib/firebase", () => ({
  signInWithGoogle: signInWithGoogleMock,
  signOutCurrentUser: vi.fn(),
  auth: {},
  db: {},
}));
// Stub out SignedInApp so this test stays focused on the auth gate.
vi.mock("@/entrypoints/popup/SignedInApp", () => ({
  SignedInApp: ({ user }: { user: { email?: string } }) => (
    <div data-testid="signed-in-app">signed in as {user.email}</div>
  ),
}));

import { App } from "@/entrypoints/popup/App";

describe("App popup auth gate", () => {
  beforeEach(() => {
    useAuthUserMock.mockReset();
    signInWithGoogleMock.mockReset();
  });

  it("shows a loading state before auth resolves", () => {
    useAuthUserMock.mockReturnValue({ user: null, loading: true });
    render(<App />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows the sign-in screen when no user is signed in", () => {
    useAuthUserMock.mockReturnValue({ user: null, loading: false });
    render(<App />);
    expect(screen.getByRole("button", { name: /sign in with google/i })).toBeInTheDocument();
  });

  it("calls signInWithGoogle when the sign-in button is clicked", async () => {
    useAuthUserMock.mockReturnValue({ user: null, loading: false });
    signInWithGoogleMock.mockResolvedValueOnce({ uid: "u1" });
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /sign in with google/i }));
    expect(signInWithGoogleMock).toHaveBeenCalledTimes(1);
  });

  it("hands off to SignedInApp once a user is signed in", () => {
    useAuthUserMock.mockReturnValue({
      user: { uid: "u1", email: "me@example.com" },
      loading: false,
    });
    render(<App />);
    expect(screen.getByTestId("signed-in-app")).toHaveTextContent(/me@example\.com/);
  });

  it("surfaces an error message when sign-in throws", async () => {
    useAuthUserMock.mockReturnValue({ user: null, loading: false });
    signInWithGoogleMock.mockRejectedValueOnce(new Error("user dismissed"));
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /sign in with google/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/dismissed/);
  });

  it("returns to the sign-in screen after the user signs out", () => {
    // First render — user is signed in.
    useAuthUserMock.mockReturnValueOnce({
      user: { uid: "u1", email: "me@example.com" },
      loading: false,
    });
    const { rerender } = render(<App />);
    expect(screen.getByTestId("signed-in-app")).toBeInTheDocument();

    // After sign-out, useAuthUser emits null — App should swap back to the sign-in screen.
    useAuthUserMock.mockReturnValueOnce({ user: null, loading: false });
    rerender(<App />);
    expect(screen.queryByTestId("signed-in-app")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in with google/i })).toBeInTheDocument();
  });
});
