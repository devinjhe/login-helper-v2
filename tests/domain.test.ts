import { describe, it, expect, beforeEach, vi } from "vitest";
import { getActiveTabDomain, normalizeDomain } from "@/lib/domain";

describe("normalizeDomain", () => {
  it("lowercases the host", () => {
    expect(normalizeDomain("GitHub.com")).toBe("github.com");
  });

  it("strips a leading www.", () => {
    expect(normalizeDomain("www.github.com")).toBe("github.com");
  });

  it("strips both case and www.", () => {
    expect(normalizeDomain("WWW.GitHub.com")).toBe("github.com");
  });

  it("accepts a bare hostname", () => {
    expect(normalizeDomain("github.com")).toBe("github.com");
  });

  it("extracts the host from a full URL", () => {
    expect(normalizeDomain("https://www.example.com/path?q=1")).toBe("example.com");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeDomain("")).toBe("");
  });
});

describe("getActiveTabDomain", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", {
      tabs: {
        query: vi.fn(),
      },
    });
  });

  it("returns the normalized domain of the active tab's URL", async () => {
    (chrome.tabs.query as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { url: "https://www.GitHub.com/user/repo" },
    ]);
    expect(await getActiveTabDomain()).toBe("github.com");
  });

  it("returns null when there is no active tab", async () => {
    (chrome.tabs.query as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    expect(await getActiveTabDomain()).toBeNull();
  });

  it("returns null when the active tab has no URL (e.g. chrome:// page)", async () => {
    (chrome.tabs.query as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{}]);
    expect(await getActiveTabDomain()).toBeNull();
  });
});
