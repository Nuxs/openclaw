import { describe, expect, it } from "vitest";
import {
  TAB_GROUPS,
  iconForTab,
  inferBasePathFromPathname,
  normalizeBasePath,
  normalizePath,
  pathForTab,
  subtitleForTab,
  tabFromPath,
  titleForTab,
  type Tab,
} from "./navigation.ts";

/** All valid tab identifiers derived from TAB_GROUPS */
const ALL_TABS: Tab[] = TAB_GROUPS.flatMap((group) => group.tabs);

describe("iconForTab", () => {
  it("returns a non-empty string for every tab", () => {
    for (const tab of ALL_TABS) {
      const icon = iconForTab(tab);
      expect(icon).toBeTruthy();
      expect(typeof icon).toBe("string");
      expect(icon.length).toBeGreaterThan(0);
    }
  });

  it("returns stable icons for known tabs", () => {
    const cases = [
      { tab: "chat", icon: "messageSquare" },
      { tab: "overview", icon: "barChart" },
      { tab: "web3", icon: "globe" },
      { tab: "channels", icon: "link" },
      { tab: "instances", icon: "radio" },
      { tab: "sessions", icon: "fileText" },
      { tab: "cron", icon: "loader" },
      { tab: "skills", icon: "zap" },
      { tab: "nodes", icon: "monitor" },
      { tab: "config", icon: "settings" },
      { tab: "debug", icon: "bug" },
      { tab: "logs", icon: "scrollText" },
    ] as const;
    for (const testCase of cases) {
      expect(iconForTab(testCase.tab), testCase.tab).toBe(testCase.icon);
    }
  });

  it("returns a fallback icon for unknown tab", () => {
    // TypeScript won't allow this normally, but runtime could receive unexpected values
    const unknownTab = "unknown" as Tab;
    expect(iconForTab(unknownTab)).toBe("folder");
  });
});

describe("titleForTab", () => {
  it("returns a non-empty string for every tab", () => {
    for (const tab of ALL_TABS) {
      const title = titleForTab(tab);
      expect(title).toBeTruthy();
      expect(typeof title).toBe("string");
    }
  });

  it("returns expected titles", () => {
    const cases = [
      { tab: "chat", title: "Chat" },
      { tab: "overview", title: "Overview" },
      { tab: "web3", title: "Web3" },
      { tab: "cron", title: "Cron Jobs" },
    ] as const;
    for (const testCase of cases) {
      expect(titleForTab(testCase.tab), testCase.tab).toBe(testCase.title);
    }
  });
});

describe("subtitleForTab", () => {
  it("returns a string for every tab", () => {
    for (const tab of ALL_TABS) {
      const subtitle = subtitleForTab(tab);
      expect(typeof subtitle).toBe("string");
    }
  });

  it("returns descriptive subtitles", () => {
    expect(subtitleForTab("chat")).toContain("chat session");
    expect(subtitleForTab("config")).toContain("openclaw.json");
  });
});

describe("normalizeBasePath", () => {
  it("returns empty string for falsy input", () => {
    expect(normalizeBasePath("")).toBe("");
  });

  it("adds leading slash if missing", () => {
    expect(normalizeBasePath("ui")).toBe("/ui");
  });

  it("removes trailing slash", () => {
    expect(normalizeBasePath("/ui/")).toBe("/ui");
  });

  it("returns empty string for root path", () => {
    expect(normalizeBasePath("/")).toBe("");
  });

  it("handles nested paths", () => {
    expect(normalizeBasePath("/apps/openclaw")).toBe("/apps/openclaw");
  });
});

describe("normalizePath", () => {
  it("returns / for falsy input", () => {
    expect(normalizePath("")).toBe("/");
  });

  it("adds leading slash if missing", () => {
    expect(normalizePath("chat")).toBe("/chat");
  });

  it("removes trailing slash except for root", () => {
    expect(normalizePath("/chat/")).toBe("/chat");
    expect(normalizePath("/")).toBe("/");
  });
});

describe("pathForTab", () => {
  it("builds tab paths with optional bases", () => {
    const cases = [
      { tab: "chat", base: undefined, expected: "/chat" },
      { tab: "overview", base: undefined, expected: "/overview" },
      { tab: "web3", base: undefined, expected: "/web3" },
      { tab: "chat", base: "/ui", expected: "/ui/chat" },
      { tab: "sessions", base: "/apps/openclaw", expected: "/apps/openclaw/sessions" },
    ] as const;
    for (const testCase of cases) {
      expect(
        pathForTab(testCase.tab, testCase.base),
        `${testCase.tab}:${testCase.base ?? "root"}`,
      ).toBe(testCase.expected);
    }
  });
});

describe("tabFromPath", () => {
  it("resolves tabs from path variants", () => {
    const cases = [
      { path: "/chat", base: undefined, expected: "chat" },
      { path: "/overview", base: undefined, expected: "overview" },
      { path: "/web3", base: undefined, expected: "web3" },
      { path: "/sessions", base: undefined, expected: "sessions" },
      { path: "/", base: undefined, expected: "chat" },
      { path: "/ui/chat", base: "/ui", expected: "chat" },
      { path: "/apps/openclaw/sessions", base: "/apps/openclaw", expected: "sessions" },
      { path: "/unknown", base: undefined, expected: null },
      { path: "/CHAT", base: undefined, expected: "chat" },
      { path: "/Overview", base: undefined, expected: "overview" },
    ] as const;
    for (const testCase of cases) {
      expect(
        tabFromPath(testCase.path, testCase.base),
        `${testCase.path}:${testCase.base ?? "root"}`,
      ).toBe(testCase.expected);
    }
  });
});

describe("inferBasePathFromPathname", () => {
  it("returns empty string for root", () => {
    expect(inferBasePathFromPathname("/")).toBe("");
  });

  it("returns empty string for direct tab path", () => {
    expect(inferBasePathFromPathname("/chat")).toBe("");
    expect(inferBasePathFromPathname("/overview")).toBe("");
  });

  it("infers base path from nested paths", () => {
    expect(inferBasePathFromPathname("/ui/chat")).toBe("/ui");
    expect(inferBasePathFromPathname("/apps/openclaw/sessions")).toBe("/apps/openclaw");
  });

  it("handles index.html suffix", () => {
    expect(inferBasePathFromPathname("/index.html")).toBe("");
    expect(inferBasePathFromPathname("/ui/index.html")).toBe("/ui");
  });
});

describe("TAB_GROUPS", () => {
  it("contains all expected groups", () => {
    const labels = TAB_GROUPS.map((g) => g.label);
    expect(labels).toContain("Chat");
    expect(labels).toContain("Control");
    expect(labels).toContain("Agent");
    expect(labels).toContain("Settings");
  });

  it("all tabs are unique", () => {
    const allTabs = TAB_GROUPS.flatMap((g) => g.tabs);
    const uniqueTabs = new Set(allTabs);
    expect(uniqueTabs.size).toBe(allTabs.length);
  });
});
