import { describe, it, expect } from "vitest";
import { entryMatches } from "@/lib/search";
import type { Entry } from "@/lib/types";

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: "e1",
    domain: "github.com",
    loginType: "Google",
    loginDetail: "me@example.com",
    notes: "personal account",
    userId: "u1",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("entryMatches", () => {
  it("matches everything for an empty or whitespace-only query", () => {
    expect(entryMatches(entry(), "")).toBe(true);
    expect(entryMatches(entry(), "   ")).toBe(true);
  });

  it("matches on domain substring", () => {
    expect(entryMatches(entry(), "hub")).toBe(true);
    expect(entryMatches(entry(), "gitlab")).toBe(false);
  });

  it("matches on login type", () => {
    expect(entryMatches(entry({ loginType: "SSO" }), "sso")).toBe(true);
  });

  it("matches on login detail", () => {
    expect(entryMatches(entry(), "example.com")).toBe(true);
  });

  it("matches on notes", () => {
    expect(entryMatches(entry(), "personal")).toBe(true);
  });

  it("is case-insensitive and trims the query", () => {
    expect(entryMatches(entry(), "  GOOGLE  ")).toBe(true);
  });

  it("does not throw when optional fields are absent", () => {
    const sparse = entry({ loginDetail: undefined, notes: undefined });
    expect(entryMatches(sparse, "github")).toBe(true);
    expect(entryMatches(sparse, "nope")).toBe(false);
  });

  it("returns false when the query matches no field", () => {
    expect(entryMatches(entry(), "zzz")).toBe(false);
  });
});
