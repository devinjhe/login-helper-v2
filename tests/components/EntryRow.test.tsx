import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Entry } from "@/lib/types";

// EntryRow imports storage (for deleteEntry) and EntryForm (which imports
// storage too); mock the boundary so the row renders without touching Firebase.
vi.mock("@/lib/storage", () => ({
  deleteEntry: vi.fn(),
  addEntry: vi.fn(),
  updateEntry: vi.fn(),
}));

import { EntryRow } from "@/entrypoints/popup/EntryRow";

function entry(createdAt: number): Entry {
  return {
    id: "e1",
    domain: "github.com",
    loginType: "Google",
    userId: "u1",
    createdAt,
    updatedAt: createdAt,
  };
}

// `relativeTime` is a private helper inside EntryRow; exercise each of its four
// branches through the rendered timestamp rather than exporting it for tests.
describe("EntryRow relativeTime rendering", () => {
  const now = Date.now();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  const cases: Array<[string, number, RegExp]> = [
    ["just now", now, /just now/i],
    ["minutes", now - 5 * minute, /^5m ago$/],
    ["hours", now - 2 * hour, /^2h ago$/],
    ["days", now - 3 * day, /^3d ago$/],
  ];

  it.each(cases)("renders the %s branch", (_label, createdAt, expected) => {
    render(
      <EntryRow
        entry={entry(createdAt)}
        onChanged={vi.fn()}
        savedLogins={[]}
        onSaveValue={vi.fn()}
        onDeleteSaved={vi.fn()}
      />,
    );
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});

describe("EntryRow headline", () => {
  it("leads with the site, login type as subheader (uniform across tabs)", () => {
    render(
      <EntryRow
        entry={entry(Date.now())}
        onChanged={vi.fn()}
        savedLogins={[]}
        onSaveValue={vi.fn()}
        onDeleteSaved={vi.fn()}
      />,
    );
    // Domain is the headline; login type is the subheader.
    const domain = screen.getByText("github.com");
    const loginType = screen.getByText("Google");
    expect(domain).toHaveClass("font-medium");
    expect(loginType).not.toHaveClass("font-medium");
  });
});
