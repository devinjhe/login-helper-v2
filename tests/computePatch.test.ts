import { describe, it, expect } from "vitest";
import { computePatch } from "@/entrypoints/popup/computePatch";
import type { Entry } from "@/lib/types";

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: "e1",
    domain: "github.com",
    loginType: "Google",
    loginDetail: "me@x",
    notes: "personal",
    userId: "u1",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("computePatch", () => {
  it("returns an empty patch when nothing changed", () => {
    const original = entry();
    const draft = {
      domain: original.domain,
      loginType: original.loginType,
      loginDetail: original.loginDetail,
      notes: original.notes,
    };
    expect(computePatch(original, draft)).toEqual({});
  });

  it("includes only the fields that actually changed", () => {
    const original = entry();
    const draft = {
      domain: original.domain,
      loginType: original.loginType,
      loginDetail: original.loginDetail,
      notes: "updated",
    };
    expect(computePatch(original, draft)).toEqual({ notes: "updated" });
  });

  it("normalizes the domain through normalizeDomain before comparing", () => {
    const original = entry({ domain: "github.com" });
    // User typed `WWW.GitHub.COM` — normalized form matches original, so no patch.
    const draft = {
      domain: "WWW.GitHub.COM",
      loginType: original.loginType,
      loginDetail: original.loginDetail,
      notes: original.notes,
    };
    expect(computePatch(original, draft)).toEqual({});
  });

  it("emits a normalized domain when it actually differs", () => {
    const original = entry({ domain: "github.com" });
    const draft = {
      domain: "WWW.GitLab.com",
      loginType: original.loginType,
      loginDetail: original.loginDetail,
      notes: original.notes,
    };
    expect(computePatch(original, draft)).toEqual({ domain: "gitlab.com" });
  });

  it("treats undefined original optional fields as empty string", () => {
    const original = entry({ loginDetail: undefined, notes: undefined });
    const draft = {
      domain: original.domain,
      loginType: original.loginType,
      loginDetail: "",
      notes: "",
    };
    expect(computePatch(original, draft)).toEqual({});
  });

  it("emits trimmed string differences", () => {
    const original = entry({ notes: "old" });
    const draft = {
      domain: original.domain,
      loginType: "  Google  ",
      loginDetail: original.loginDetail,
      notes: "  new  ",
    };
    // loginType trimmed === original loginType, so it's not in the patch.
    // notes trimmed differs, so it is.
    expect(computePatch(original, draft)).toEqual({ notes: "new" });
  });
});
