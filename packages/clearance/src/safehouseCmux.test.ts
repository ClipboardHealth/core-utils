import path from "node:path";

import {
  SAFEHOUSE_CMUX_CLAUDE_COMMAND_PRELUDE,
  SAFEHOUSE_CMUX_ENV_PASS,
  resolveSafehouseCmuxIntegration,
} from "./safehouseCmux.ts";

describe(resolveSafehouseCmuxIntegration, () => {
  it("returns reviewed cmux env pass names and the Claude prelude", () => {
    const actual = resolveSafehouseCmuxIntegration({
      env: {},
      readFile: () => "",
    });

    expect(actual.envPass).toStrictEqual(SAFEHOUSE_CMUX_ENV_PASS);
    expect(actual.isActive).toBe(false);
    expect(actual.claudeCommandPrelude).toBe(SAFEHOUSE_CMUX_CLAUDE_COMMAND_PRELUDE);
    expect(actual.claudeCommandPrelude).toContain("CMUX_CUSTOM_CLAUDE_PATH");
    expect(actual.claudeCommandPrelude).toContain("*/cmux-cli-shims/*|*/cmux-cli-shims)");
  });

  it("marks the integration active when cmux has installed its Claude shim", () => {
    const actual = resolveSafehouseCmuxIntegration({
      env: {
        CMUX_CLAUDE_WRAPPER_SHIM: "/tmp/cmux-cli-shims/surface-1/claude",
      },
      readFile: () => "",
    });

    expect(actual.isActive).toBe(true);
  });

  it("resolves cmux read-only dirs from state and socket environment", () => {
    const actual = resolveSafehouseCmuxIntegration({
      env: {
        CMUX_SOCKET_PATH: "/tmp/cmux-state/cmux.sock",
        HOME: "/Users/dev",
      },
      readFile: () => "",
    });

    expect(actual.addDirsReadOnly).toStrictEqual([
      "/Applications/cmux.app",
      "/Users/dev/.local/state/cmux",
      "/tmp/cmux-state",
    ]);
  });

  it("prefers XDG_STATE_HOME and dedupes the socket directory", () => {
    const actual = resolveSafehouseCmuxIntegration({
      env: {
        CMUX_SOCKET_PATH: "/state/cmux/cmux.sock",
        HOME: "/Users/dev",
        XDG_STATE_HOME: "/state",
      },
      readFile: () => "",
    });

    expect(actual.addDirsReadOnly).toStrictEqual(["/Applications/cmux.app", "/state/cmux"]);
  });

  it("reports cmux wrapper env names that have not been reviewed", () => {
    const readFile = vi.fn<() => string>(() =>
      [
        "CMUX_SOCKET_PATH",
        "CMUX_CLAUDE_PID",
        "CMUX_NEW_REQUIRED_SETTING",
        "CMUX_NEW_REQUIRED_SETTING",
      ].join("\n"),
    );
    const actual = resolveSafehouseCmuxIntegration({
      env: {
        CMUX_BUNDLED_CLI_PATH: "/tmp/cmux/bin/cmux",
      },
      readFile,
    });

    expect(readFile).toHaveBeenCalledWith(path.join("/tmp/cmux/bin", "cmux-claude-wrapper"));
    expect(actual.unreviewedEnvNames).toStrictEqual(["CMUX_NEW_REQUIRED_SETTING"]);
  });

  it("falls back to the default cmux wrapper path when the bundled wrapper is unavailable", () => {
    const readFile = vi
      .fn<(filePath: string) => string>()
      .mockImplementationOnce(() => {
        throw new Error("missing bundled wrapper");
      })
      .mockReturnValue("CMUX_FALLBACK_SETTING");
    const actual = resolveSafehouseCmuxIntegration({
      env: {
        CMUX_BUNDLED_CLI_PATH: "/tmp/cmux/bin/cmux",
      },
      readFile,
    });

    expect(readFile.mock.calls.map((call) => call[0])).toStrictEqual([
      path.join("/tmp/cmux/bin", "cmux-claude-wrapper"),
      "/Applications/cmux.app/Contents/Resources/bin/cmux-claude-wrapper",
    ]);
    expect(actual.unreviewedEnvNames).toStrictEqual(["CMUX_FALLBACK_SETTING"]);
  });

  it("ignores unreadable cmux wrappers", () => {
    const actual = resolveSafehouseCmuxIntegration({
      env: {},
      readFile: () => {
        throw new Error("missing");
      },
    });

    expect(actual.unreviewedEnvNames).toStrictEqual([]);
  });
});
