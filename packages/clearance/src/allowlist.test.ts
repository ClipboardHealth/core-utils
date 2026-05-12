import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { resolveAllowlist } from "./allowlist.js";

type ReadFile = (path: string) => string;

function fakeFiles(contents: Readonly<Record<string, string>>): ReturnType<typeof vi.fn<ReadFile>> {
  return vi.fn<ReadFile>((path) => {
    const content = contents[path];
    if (content === undefined) {
      throw new Error(`unexpected readFile path: ${path}`);
    }
    return content;
  });
}

describe(resolveAllowlist, () => {
  it("reads literal hosts from CLEARANCE_ALLOW_HOSTS", () => {
    const actual = resolveAllowlist({
      env: { CLEARANCE_ALLOW_HOSTS: "api.example.com,*.example.com" },
    });

    expect(actual).toStrictEqual(["api.example.com", "*.example.com"]);
  });

  it("reads hosts from a file referenced by CLEARANCE_ALLOW_HOSTS_FILES", () => {
    const readFile = fakeFiles({ "/team/hosts": "api.example.com\n*.example.com\n" });

    const actual = resolveAllowlist({
      env: { CLEARANCE_ALLOW_HOSTS_FILES: "/team/hosts" },
      readFile,
    });

    expect(actual).toStrictEqual(["api.example.com", "*.example.com"]);
    expect(readFile).toHaveBeenCalledWith("/team/hosts");
  });

  it("ignores blank lines and #-prefixed comments in files", () => {
    const readFile = fakeFiles({
      "/hosts": [
        "# AI agents",
        "api.openai.com",
        "",
        "  # whitespace before comment",
        "api.anthropic.com  # trailing comment",
        "",
      ].join("\n"),
    });

    const actual = resolveAllowlist({
      env: { CLEARANCE_ALLOW_HOSTS_FILES: "/hosts" },
      readFile,
    });

    expect(actual).toStrictEqual(["api.openai.com", "api.anthropic.com"]);
  });

  it("concatenates env literal and file hosts and dedupes", () => {
    const readFile = fakeFiles({ "/hosts": "api.example.com\nfoo.example.com\n" });

    const actual = resolveAllowlist({
      env: {
        CLEARANCE_ALLOW_HOSTS: "api.example.com,bar.example.com",
        CLEARANCE_ALLOW_HOSTS_FILES: "/hosts",
      },
      readFile,
    });

    expect(actual).toStrictEqual(["api.example.com", "bar.example.com", "foo.example.com"]);
  });

  it("loads multiple files separated by the platform PATH delimiter in declared order", () => {
    const readFile = fakeFiles({
      "/team": "team.example.com\n",
      "/personal": "personal.example.com\n",
    });

    const actual = resolveAllowlist({
      env: { CLEARANCE_ALLOW_HOSTS_FILES: `/team${delimiter}/personal` },
      readFile,
    });

    expect(actual).toStrictEqual(["team.example.com", "personal.example.com"]);
    expect(readFile).toHaveBeenCalledTimes(2);
  });

  it("ignores blank file path entries between separators", () => {
    const readFile = fakeFiles({ "/hosts": "foo.example.com\n" });

    const actual = resolveAllowlist({
      env: { CLEARANCE_ALLOW_HOSTS_FILES: ` ${delimiter}/hosts${delimiter} ` },
      readFile,
    });

    expect(actual).toStrictEqual(["foo.example.com"]);
    expect(readFile).toHaveBeenCalledTimes(1);
  });

  it("normalizes hosts conservatively and silently skips invalid entries", () => {
    const readFile = fakeFiles({
      "/hosts": "Example.COM.\n*.Example.com\nbad/host\nfoo*bar\n[::1]\n",
    });

    const actual = resolveAllowlist({
      env: { CLEARANCE_ALLOW_HOSTS_FILES: "/hosts" },
      readFile,
    });

    expect(actual).toStrictEqual(["example.com", "*.example.com", "::1"]);
  });

  it("throws when neither CLEARANCE_ALLOW_HOSTS nor _FILES is set", () => {
    expect(() => resolveAllowlist({ env: {} })).toThrow(
      /Set CLEARANCE_ALLOW_HOSTS or CLEARANCE_ALLOW_HOSTS_FILES/,
    );
  });

  it("throws when all sources are present but yield zero valid hosts", () => {
    const readFile = fakeFiles({ "/hosts": "# comment only\n\n" });

    expect(() =>
      resolveAllowlist({
        env: {
          CLEARANCE_ALLOW_HOSTS: "   ",
          CLEARANCE_ALLOW_HOSTS_FILES: "/hosts",
        },
        readFile,
      }),
    ).toThrow(/Set CLEARANCE_ALLOW_HOSTS or CLEARANCE_ALLOW_HOSTS_FILES/);
  });

  it("wraps file read errors with the offending path", () => {
    const readFile = vi.fn<ReadFile>(() => {
      throw new Error("ENOENT: no such file");
    });

    expect(() =>
      resolveAllowlist({
        env: { CLEARANCE_ALLOW_HOSTS_FILES: "/missing" },
        readFile,
      }),
    ).toThrow(/Failed to read CLEARANCE_ALLOW_HOSTS_FILES path "\/missing": ENOENT/);
  });

  it("stringifies non-Error throws when wrapping a file read failure", () => {
    const denial = "denied";
    const readFile = vi.fn<ReadFile>(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- exercise non-Error branch
      throw denial;
    });

    expect(() =>
      resolveAllowlist({
        env: { CLEARANCE_ALLOW_HOSTS_FILES: "/forbidden" },
        readFile,
      }),
    ).toThrow(/Failed to read CLEARANCE_ALLOW_HOSTS_FILES path "\/forbidden": denied/);
  });

  it("preserves the original error as the cause when wrapping a file read error", () => {
    const cause = new Error("ENOENT: no such file");
    const readFile = vi.fn<ReadFile>(() => {
      throw cause;
    });
    let captured: unknown;

    try {
      resolveAllowlist({
        env: { CLEARANCE_ALLOW_HOSTS_FILES: "/missing" },
        readFile,
      });
    } catch (error: unknown) {
      captured = error;
    }

    expect(captured).toHaveProperty("cause", cause);
  });

  it("reads from disk via readFileSync by default", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "resolve-allowlist-"));
    const hostsFile = join(tempDir, "hosts");
    writeFileSync(hostsFile, "api.example.com\n");
    try {
      const actual = resolveAllowlist({
        env: { CLEARANCE_ALLOW_HOSTS_FILES: hostsFile },
      });

      expect(actual).toStrictEqual(["api.example.com"]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
