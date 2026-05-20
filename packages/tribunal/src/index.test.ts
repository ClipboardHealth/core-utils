import {
  loadContext,
  type LoadContextInput,
  parseCliArguments,
  runCli,
  type RunCliInput,
  type TribunalRequest,
  type TribunalResponse,
} from "./index.ts";

describe("CLI argument parsing", () => {
  it("parses query and flags", () => {
    const actual = parseCliArguments([
      "Should we launch?",
      "--context",
      "Users are waiting.",
      "--context-file",
      "./design.md",
      "--model",
      "advocate=anthropic:claude-opus-4-7",
      "--deliberator",
      "openai:gpt-5.4",
      "--reasoning",
      "skeptic=xhigh",
      "--reasoning",
      "deliberator=high",
      "--output",
      "markdown",
      "--show-perspectives",
      "--verbose",
      "--save-intermediates",
      "./run.json",
    ]);

    expect(actual).toMatchObject({
      context: "Users are waiting.",
      contextFilePath: "./design.md",
      outputFormat: "markdown",
      query: "Should we launch?",
      shouldShowHelp: false,
      shouldSaveIntermediates: true,
      showPerspectives: true,
      intermediateOutputFilePath: "./run.json",
      verbose: true,
    });
    expect(actual.models.advocate).toStrictEqual({
      modelId: "claude-opus-4-7",
      provider: "anthropic",
    });
    expect(actual.models.deliberator).toStrictEqual({ modelId: "gpt-5.4", provider: "openai" });
    expect(actual.reasoning).toStrictEqual({ deliberator: "high", skeptic: "xhigh" });
  });

  it("joins unquoted query words", () => {
    const actual = parseCliArguments(["Should", "we", "launch?"]);

    expect(actual.query).toBe("Should we launch?");
  });

  it("returns help without requiring a query", () => {
    const actual = parseCliArguments(["--help"]);

    expect(actual.shouldShowHelp).toBe(true);
  });

  it("parses intermediate output opt-out", () => {
    const actual = parseCliArguments(["Should we launch?", "--no-save-intermediates"]);

    expect(actual.shouldSaveIntermediates).toBe(false);
  });

  it("defaults to writing and opening the HTML report", () => {
    const actual = parseCliArguments(["Should we launch?"]);

    expect(actual.shouldWriteHtmlReport).toBe(true);
    expect(actual.shouldOpenHtmlReport).toBe(true);
    expect(actual.htmlReportFilePath).toBeUndefined();
  });

  it("parses --html and --no-open flags", () => {
    const actual = parseCliArguments(["Should we launch?", "--html", "./report.html", "--no-open"]);

    expect(actual.shouldWriteHtmlReport).toBe(true);
    expect(actual.shouldOpenHtmlReport).toBe(false);
    expect(actual.htmlReportFilePath).toBe("./report.html");
  });

  it("parses --no-html opt-out", () => {
    const actual = parseCliArguments(["Should we launch?", "--no-html"]);

    expect(actual.shouldWriteHtmlReport).toBe(false);
    expect(actual.htmlReportFilePath).toBeUndefined();
  });
});

describe("context loading", () => {
  it("loads inline context", async () => {
    const actual = await loadContext({
      cwd: "/repo",
      inlineContext: "Current system is stable.",
    });

    expect(actual).toStrictEqual({ context: "Current system is stable.", warnings: [] });
  });

  it("loads a context file", async () => {
    const readFile = vi.fn<NonNullable<LoadContextInput["readFile"]>>(async () => "File details.");

    const actual = await loadContext({
      contextFilePath: "./design.md",
      cwd: "/repo",
      readFile,
    });

    expect(readFile).toHaveBeenCalledWith("/repo/design.md", "utf8");
    expect(actual).toStrictEqual({
      context: "File context from ./design.md:\n\nFile details.",
      warnings: [],
    });
  });

  it("combines inline and file context", async () => {
    const actual = await loadContext({
      contextFilePath: "./design.md",
      cwd: "/repo",
      inlineContext: "Inline details.",
      readFile: async () => "File details.",
    });

    expect(actual.context).toBe(
      "Inline context:\n\nInline details.\n\nFile context from ./design.md:\n\nFile details.",
    );
  });

  it("fails on missing context file", async () => {
    await expect(
      loadContext({
        contextFilePath: "./missing.md",
        cwd: "/repo",
        readFile: async () => {
          throw new Error("ENOENT");
        },
      }),
    ).rejects.toThrow("Failed to read context file");
  });

  it("truncates oversized context", async () => {
    const actual = await loadContext({
      cwd: "/repo",
      inlineContext: "123456",
      maxContextChars: 4,
    });

    expect(actual).toStrictEqual({
      context: "1234",
      warnings: ["Context exceeded 4 characters and was truncated."],
    });
  });
});

describe("CLI runner", () => {
  it("prints verbose progress and wait dots to stderr", async () => {
    vi.useFakeTimers();

    try {
      let stdout = "";
      let stderr = "";
      const model = { modelId: "gpt-5.4", provider: "openai" } as const;

      const runPromise = runCli({
        argv: ["Should we launch?", "--verbose", "--no-save-intermediates", "--no-html"],
        cwd: "/repo",
        environment: {},
        runTribunal: async (_request, options) => {
          await options.onProgress?.({ model, role: "advocate", status: "started" });

          await new Promise((resolve) => {
            setTimeout(resolve, 5500);
          });

          await options.onProgress?.({
            latencyMs: 5500,
            model,
            role: "advocate",
            status: "completed",
          });

          return createCliResponse();
        },
        stderr: {
          write: (chunk: string) => {
            stderr += chunk;
          },
        },
        stdout: {
          write: (chunk: string) => {
            stdout += chunk;
          },
        },
      });

      await vi.advanceTimersByTimeAsync(5500);

      const actual = await runPromise;

      expect(actual).toBe(0);
      expect(stdout).toContain("Launch carefully.");
      expect(stderr).toContain("Running tribunal...\n");
      expect(stderr).toContain("Starting advocate (openai:gpt-5.4)...\n");
      expect(stderr).toContain(".\nFinished advocate in 5.5s.\n");
    } finally {
      vi.useRealTimers();
    }
  });

  it("prints warnings to stderr when verbose mode is enabled", async () => {
    let stdout = "";
    let stderr = "";
    let capturedRequest: TribunalRequest | undefined;

    const actual = await runCli({
      argv: [
        "Should we launch?",
        "--reasoning",
        "deliberator=high",
        "--verbose",
        "--no-save-intermediates",
        "--no-html",
      ],
      cwd: "/repo",
      environment: {},
      runTribunal: async (request) => {
        capturedRequest = request;

        return {
          metadata: {
            estimatedCostUsd: null,
            latencyMs: 1,
            models: {
              advocate: { modelId: "claude-opus-4-7", provider: "anthropic" },
              analyst: { modelId: "gemini-3.1-pro-preview", provider: "google" },
              deliberator: { modelId: "gpt-5.4", provider: "openai" },
              skeptic: { modelId: "gpt-5.4", provider: "openai" },
            },
            totalUsage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
            warnings: ["one warning"],
          },
          perspectives: [],
          result: {
            answer: "Launch carefully.",
            caveats: [],
            confidence: 0.8,
            consensus: [],
            disagreements: [],
            keyTakeaways: ["Do the work."],
            openQuestions: [],
            recommendation: "Launch.",
          },
        };
      },
      stderr: {
        write: (chunk: string) => {
          stderr += chunk;
        },
      },
      stdout: {
        write: (chunk: string) => {
          stdout += chunk;
        },
      },
    });

    expect(actual).toBe(0);
    expect(capturedRequest).toMatchObject({ reasoning: { deliberator: "high" } });
    expect(stdout).toContain("Launch carefully.");
    expect(stderr).toContain("one warning");
  });

  it("writes intermediate output snapshots while running", async () => {
    let stdout = "";
    let stderr = "";
    const createdDirectories: string[] = [];
    const writes: string[] = [];
    const model = { modelId: "gpt-5.4", provider: "openai" } as const;

    const actual = await runCli({
      argv: ["Should we launch?", "--save-intermediates", "./run.json", "--no-html"],
      cwd: "/repo",
      environment: {},
      makeDirectory: async (path) => {
        createdDirectories.push(path);
      },
      now: createClock(["2026-05-19T02:03:04.005Z", "2026-05-19T02:03:05.005Z"]),
      runTribunal: async (_request, options) => {
        await options.onProgress?.({
          latencyMs: 1000,
          metadata: { latencyMs: 1000, model },
          model,
          output: { role: "advocate", summary: "Strong upside." },
          role: "advocate",
          status: "completed",
        });

        return createCliResponse();
      },
      stderr: {
        write: (chunk: string) => {
          stderr += chunk;
        },
      },
      stdout: {
        write: (chunk: string) => {
          stdout += chunk;
        },
      },
      writeFile: async (_path, contents) => {
        writes.push(contents);
      },
    });
    const missingWrite = "__missing_intermediate_output__";
    const [lastWrite = missingWrite] = writes.slice(-1);

    expect(actual).toBe(0);
    expect(stdout).toContain("Launch carefully.");
    expect(createdDirectories).toStrictEqual(["/repo"]);
    expect(lastWrite).not.toBe(missingWrite);
    expect(stderr).toContain("Saving intermediate outputs to /repo/run.json\n");
    expect(JSON.parse(lastWrite)).toMatchObject({
      calls: {
        advocate: {
          output: { role: "advocate", summary: "Strong upside." },
          status: "completed",
        },
      },
      response: createCliResponse(),
      status: "completed",
    });
  });

  it("writes an HTML report and invokes the opener once", async () => {
    let stdout = "";
    let stderr = "";
    const htmlWrites: { filePath: string; html: string }[] = [];
    const opens: string[] = [];

    const actual = await runCli({
      argv: ["Should we launch?", "--no-save-intermediates"],
      cwd: "/repo",
      environment: {},
      now: createClock(["2026-05-20T12:34:56.000Z"]),
      openHtmlReport: async (filePath) => {
        opens.push(filePath);
      },
      runTribunal: async () => createCliResponse(),
      stderr: {
        write: (chunk: string) => {
          stderr += chunk;
        },
      },
      stdout: {
        write: (chunk: string) => {
          stdout += chunk;
        },
      },
      writeHtmlReport: async (filePath, html) => {
        htmlWrites.push({ filePath, html });
      },
    });

    expect(actual).toBe(0);
    expect(stdout).toContain("Launch carefully.");
    expect(htmlWrites).toHaveLength(1);
    const [write] = htmlWrites;
    expect(write?.filePath).toBe("/repo/.tribunal/reports/2026-05-20T12-34-56-000Z.html");
    expect(write?.html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(opens).toStrictEqual(["/repo/.tribunal/reports/2026-05-20T12-34-56-000Z.html"]);
    expect(stderr).toContain(
      "Wrote HTML report to /repo/.tribunal/reports/2026-05-20T12-34-56-000Z.html\n",
    );
  });

  it("honors --html path and --no-open", async () => {
    const htmlWrites: { filePath: string; html: string }[] = [];
    const opens: string[] = [];

    const actual = await runCli({
      argv: [
        "Should we launch?",
        "--no-save-intermediates",
        "--html",
        "./report.html",
        "--no-open",
      ],
      cwd: "/repo",
      environment: {},
      openHtmlReport: async (filePath) => {
        opens.push(filePath);
      },
      runTribunal: async () => createCliResponse(),
      stderr: { write: noopWrite },
      stdout: { write: noopWrite },
      writeHtmlReport: async (filePath, html) => {
        htmlWrites.push({ filePath, html });
      },
    });

    expect(actual).toBe(0);
    expect(htmlWrites).toHaveLength(1);
    expect(htmlWrites[0]?.filePath).toBe("/repo/report.html");
    expect(opens).toStrictEqual([]);
  });

  it("skips HTML when --no-html is set", async () => {
    const htmlWrites: { filePath: string; html: string }[] = [];
    const opens: string[] = [];

    const actual = await runCli({
      argv: ["Should we launch?", "--no-save-intermediates", "--no-html"],
      cwd: "/repo",
      environment: {},
      openHtmlReport: async (filePath) => {
        opens.push(filePath);
      },
      runTribunal: async () => createCliResponse(),
      stderr: { write: noopWrite },
      stdout: { write: noopWrite },
      writeHtmlReport: async (filePath, html) => {
        htmlWrites.push({ filePath, html });
      },
    });

    expect(actual).toBe(0);
    expect(htmlWrites).toHaveLength(0);
    expect(opens).toHaveLength(0);
  });

  it("preserves the original CLI error when failure snapshot persistence fails", async () => {
    let stdout = "";
    let stderr = "";
    const createdDirectories: string[] = [];
    const writeFile = vi.fn<NonNullable<RunCliInput["writeFile"]>>();

    writeFile.mockResolvedValueOnce();
    writeFile.mockRejectedValueOnce(new Error("disk full"));

    const actual = await runCli({
      argv: ["Should we launch?", "--save-intermediates", "./run.json", "--no-html"],
      cwd: "/repo",
      environment: {},
      makeDirectory: async (path) => {
        createdDirectories.push(path);
      },
      runTribunal: async () => {
        throw new Error("provider failed");
      },
      stderr: {
        write: (chunk: string) => {
          stderr += chunk;
        },
      },
      stdout: {
        write: (chunk: string) => {
          stdout += chunk;
        },
      },
      writeFile,
    });

    expect(actual).toBe(1);
    expect(createdDirectories).toStrictEqual(["/repo"]);
    expect(writeFile).toHaveBeenCalledTimes(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("Warning: Failed to persist failure snapshot: disk full\n");
    expect(stderr).toContain("Error: provider failed\n");
  });
});

function noopWrite(_chunk: string): void {
  // Silence stdout/stderr in tests that do not inspect them.
}

function createClock(values: string[]): () => Date {
  let index = 0;

  return () => {
    const value = values.at(index) ?? values.at(-1);
    index += 1;

    if (value === undefined) {
      throw new Error("Clock has no values.");
    }

    return new Date(value);
  };
}

function createCliResponse(): TribunalResponse {
  return {
    metadata: {
      estimatedCostUsd: null,
      latencyMs: 1,
      models: {
        advocate: { modelId: "claude-opus-4-7", provider: "anthropic" },
        analyst: { modelId: "gemini-3.1-pro-preview", provider: "google" },
        deliberator: { modelId: "gpt-5.4", provider: "openai" },
        skeptic: { modelId: "gpt-5.4", provider: "openai" },
      },
      totalUsage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      warnings: [],
    },
    perspectives: [],
    result: {
      answer: "Launch carefully.",
      caveats: [],
      confidence: 0.8,
      consensus: [],
      disagreements: [],
      keyTakeaways: ["Do the work."],
      openQuestions: [],
      recommendation: "Launch.",
    },
  };
}
