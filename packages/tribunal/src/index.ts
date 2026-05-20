import { spawn } from "node:child_process";
import {
  mkdir,
  readFile as readFileFromDisk,
  writeFile as writeFileToDisk,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { formatOutput } from "./format.ts";
import { renderHtmlReport } from "./html.ts";
import {
  createDefaultIntermediateOutputPath,
  createIntermediateOutputRecorder,
  type CreateIntermediateOutputRecorderInput,
  type IntermediateOutputRecorder,
} from "./intermediates.ts";
import {
  formatModelSpec,
  type ModelRole,
  type ModelSpec,
  parseModelOverride,
  parseModelSpec,
} from "./models.ts";
import { parseReasoningOverride, type ReasoningOverrides } from "./reasoning.ts";
import {
  type OutputFormat,
  runTribunal as runTribunalDefault,
  type TribunalProgressEvent,
  type TribunalProgressHandler,
  type TribunalRequest,
  type TribunalResponse,
} from "./tribunal.ts";
export { formatOutput, type FormatOutputInput } from "./format.ts";
export {
  createDefaultIntermediateOutputPath,
  createIntermediateOutputRecorder,
  type CreateIntermediateOutputRecorderInput,
  type IntermediateOutputCall,
  type IntermediateOutputEvent,
  type IntermediateOutputRecorder,
  type IntermediateOutputRunStatus,
  type IntermediateOutputSnapshot,
} from "./intermediates.ts";
export {
  DEFAULT_MODELS,
  formatModelSpec,
  parseModelOverride,
  parseModelRole,
  parseModelSpec,
  resolveLanguageModel,
  resolveModelSet,
} from "./models.ts";
export {
  createReasoningProviderOptions,
  parseReasoningLevel,
  parseReasoningOverride,
  type ReasoningLevel,
  type ReasoningOverride,
  type ReasoningOverrides,
  type ReasoningProviderOptions,
} from "./reasoning.ts";
export {
  type Claim,
  claimSchema,
  confidenceSchema,
  type DeliberationResult,
  deliberationResultSchema,
  type PerspectiveResult,
  perspectiveResultSchema,
  type Role,
  roleSchema,
} from "./schemas.ts";
export {
  type CallMetadata,
  type CostEstimate,
  type CostEstimateCall,
  estimateCostUsd,
  normalizeUsage,
  type OutputFormat,
  type PerspectiveOutput,
  runStructuredOutput,
  runTribunal,
  type StructuredOutputInput,
  type StructuredOutputResult,
  type StructuredOutputRunner,
  sumTokenUsage,
  type TokenUsage,
  type TribunalProgressEvent,
  type TribunalProgressHandler,
  type TribunalProgressStatus,
  type TribunalRequest,
  type TribunalResponse,
} from "./tribunal.ts";

interface HtmlFlagState {
  htmlReportFilePath: string | undefined;
  shouldOpenHtmlReport: boolean;
  shouldWriteHtmlReport: boolean;
}

export interface ParsedCliArguments {
  query: string;
  context?: string;
  contextFilePath?: string;
  models: Partial<Record<ModelRole, ModelSpec>>;
  reasoning: ReasoningOverrides;
  intermediateOutputFilePath?: string;
  htmlReportFilePath?: string;
  outputFormat: OutputFormat;
  showPerspectives: boolean;
  shouldSaveIntermediates: boolean;
  shouldWriteHtmlReport: boolean;
  shouldOpenHtmlReport: boolean;
  verbose: boolean;
  shouldShowHelp: boolean;
}

export interface LoadContextInput {
  cwd: string;
  inlineContext?: string;
  contextFilePath?: string;
  maxContextChars?: number;
  readFile?: (path: string, encoding: BufferEncoding) => Promise<string>;
}

export interface LoadedContext {
  context?: string;
  warnings: string[];
}

export interface TextWritable {
  write(chunk: string): void;
}

interface CliProgressReporter {
  onProgress: TribunalProgressHandler;
  stop: () => void;
}

export interface RunCliInput {
  argv?: readonly string[];
  cwd?: string;
  environment?: Record<string, string | undefined>;
  stdout?: TextWritable;
  stderr?: TextWritable;
  readFile?: (path: string, encoding: BufferEncoding) => Promise<string>;
  writeFile?: CreateIntermediateOutputRecorderInput["writeFile"];
  makeDirectory?: CreateIntermediateOutputRecorderInput["makeDirectory"];
  writeHtmlReport?: (filePath: string, html: string) => Promise<void>;
  openHtmlReport?: (filePath: string) => Promise<void>;
  now?: () => Date;
  runTribunal?: (
    request: TribunalRequest,
    options: {
      environment: Record<string, string | undefined>;
      onProgress?: TribunalProgressHandler;
    },
  ) => Promise<TribunalResponse>;
}

const MAX_CONTEXT_CHARS = 120_000;
const DEFAULT_PROGRESS_INTERVAL_MS = 5000;

const USAGE = `Usage:
  tribunal "Should we use microservices or a monolith?"

Flags:
  --context <text>                 Inline context string
  --context-file <path>            Read additional context from a file
  --model <role=provider:model>    Override advocate, skeptic, or analyst model
  --deliberator <provider:model>   Override deliberator model
  --reasoning <role=level>         Override reasoning for advocate, skeptic, analyst, or deliberator
  --output <text|json|markdown>    Output format; default text
  --show-perspectives              Include specialist outputs in text/markdown
  --save-intermediates <path>      Write intermediate run snapshots; default .tribunal/runs/<timestamp>.json
  --no-save-intermediates          Disable intermediate run snapshots
  --html <path>                    Write HTML report; default .tribunal/reports/<timestamp>.html
  --no-html                        Disable HTML report
  --no-open                        Write the HTML report but skip opening it
  --verbose                        Print progress, wait dots, and warnings to stderr
  -h, --help                       Show usage`;

export function parseCliArguments(argv: readonly string[]): ParsedCliArguments {
  const positionalArguments: string[] = [];
  const models: Partial<Record<ModelRole, ModelSpec>> = {};
  const reasoning: ReasoningOverrides = {};
  let intermediateOutputFilePath: string | undefined;
  let htmlReportFilePath: string | undefined;
  let context: string | undefined;
  let contextFilePath: string | undefined;
  let outputFormat: OutputFormat = "text";
  let showPerspectives = false;
  let shouldSaveIntermediates = true;
  let shouldWriteHtmlReport = true;
  let shouldOpenHtmlReport = true;
  let verbose = false;
  let shouldShowHelp = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === undefined) {
      continue;
    }

    switch (argument) {
      case "-h":
      case "--help": {
        shouldShowHelp = true;
        break;
      }
      case "--context": {
        context = readFlagValue({ argv, flag: argument, index });
        index += 1;
        break;
      }
      case "--context-file": {
        contextFilePath = readFlagValue({ argv, flag: argument, index });
        index += 1;
        break;
      }
      case "--model": {
        const override = parseModelOverride(readFlagValue({ argv, flag: argument, index }));
        models[override.role] = override.model;
        index += 1;
        break;
      }
      case "--deliberator": {
        models.deliberator = parseModelSpec(readFlagValue({ argv, flag: argument, index }));
        index += 1;
        break;
      }
      case "--reasoning": {
        const override = parseReasoningOverride(readFlagValue({ argv, flag: argument, index }));
        reasoning[override.role] = override.level;
        index += 1;
        break;
      }
      case "--output": {
        outputFormat = parseOutputFormat(readFlagValue({ argv, flag: argument, index }));
        index += 1;
        break;
      }
      case "--show-perspectives": {
        showPerspectives = true;
        break;
      }
      case "--save-intermediates": {
        intermediateOutputFilePath = readFlagValue({ argv, flag: argument, index });
        shouldSaveIntermediates = true;
        index += 1;
        break;
      }
      case "--no-save-intermediates": {
        shouldSaveIntermediates = false;
        intermediateOutputFilePath = undefined;
        break;
      }
      case "--verbose": {
        verbose = true;
        break;
      }
      default: {
        const htmlState: HtmlFlagState = {
          htmlReportFilePath,
          shouldOpenHtmlReport,
          shouldWriteHtmlReport,
        };
        const htmlAdvance = tryApplyHtmlFlag({ argv, argument, index, state: htmlState });

        if (htmlAdvance >= 0) {
          ({ htmlReportFilePath, shouldOpenHtmlReport, shouldWriteHtmlReport } = htmlState);
          index += htmlAdvance;
          break;
        }

        if (argument.startsWith("-")) {
          throw new Error(`Unknown flag: ${argument}`);
        }

        positionalArguments.push(argument);
        break;
      }
    }
  }

  const query = positionalArguments.join(" ").trim();

  if (!shouldShowHelp && query.length === 0) {
    throw new Error("Query is required. Run tribunal --help for usage.");
  }

  const parsedArguments: ParsedCliArguments = {
    query,
    models,
    outputFormat,
    reasoning,
    shouldOpenHtmlReport,
    shouldSaveIntermediates,
    shouldWriteHtmlReport,
    showPerspectives,
    verbose,
    shouldShowHelp,
  };

  assignParsedContext(parsedArguments, context);
  assignParsedContextFilePath(parsedArguments, contextFilePath);
  assignParsedIntermediateOutputFilePath(parsedArguments, intermediateOutputFilePath);
  assignParsedHtmlReportFilePath(parsedArguments, htmlReportFilePath);

  return parsedArguments;
}

export async function loadContext(input: LoadContextInput): Promise<LoadedContext> {
  const {
    contextFilePath,
    cwd,
    inlineContext,
    maxContextChars = MAX_CONTEXT_CHARS,
    readFile = readFileFromDisk,
  } = input;
  const warnings: string[] = [];
  const parts: string[] = [];

  if (inlineContext !== undefined) {
    parts.push(inlineContext);
  }

  if (contextFilePath !== undefined) {
    let fileContents: string;

    try {
      fileContents = await readFile(resolve(cwd, contextFilePath), "utf8");
    } catch (error) {
      throw new Error(
        `Failed to read context file ${contextFilePath}: ${formatErrorMessage(error)}`,
        { cause: error },
      );
    }

    if (inlineContext !== undefined) {
      parts.splice(0, 1, `Inline context:\n\n${inlineContext}`);
    }

    parts.push(`File context from ${contextFilePath}:\n\n${fileContents}`);
  }

  if (parts.length === 0) {
    return { warnings };
  }

  const combinedContext = parts.join("\n\n");

  if (combinedContext.length <= maxContextChars) {
    return { context: combinedContext, warnings };
  }

  warnings.push(`Context exceeded ${maxContextChars} characters and was truncated.`);

  return {
    context: combinedContext.slice(0, maxContextChars),
    warnings,
  };
}

export async function runCli(input: RunCliInput = {}): Promise<number> {
  const argv = input.argv ?? process.argv.slice(2);
  const cwd = input.cwd ?? process.cwd();
  // oxlint-disable-next-line node/no-process-env -- CLI defaults to inherited environment so op run can inject API keys and model override vars at runtime.
  const environment = input.environment ?? process.env;
  const stdout = input.stdout ?? process.stdout;
  const stderr = input.stderr ?? process.stderr;
  const runTribunal = input.runTribunal ?? runTribunalDefault;
  let progressReporter: CliProgressReporter | undefined;
  let intermediateOutputRecorder: IntermediateOutputRecorder | undefined;

  try {
    const parsedArguments = parseCliArguments(argv);

    if (parsedArguments.shouldShowHelp) {
      stdout.write(`${USAGE}\n`);
      return 0;
    }

    if (parsedArguments.verbose) {
      stderr.write("Running tribunal...\n");
      progressReporter = createCliProgressReporter({
        intervalMs: DEFAULT_PROGRESS_INTERVAL_MS,
        stderr,
      });
    }

    const loadContextInput = createLoadContextInput({
      cwd,
      parsedArguments,
      readFile: input.readFile,
    });
    const loadedContext = await loadContext(loadContextInput);
    const tribunalRequest = createTribunalRequest(parsedArguments, loadedContext);
    intermediateOutputRecorder = await createCliIntermediateOutputRecorder({
      cwd,
      makeDirectory: input.makeDirectory,
      now: input.now,
      parsedArguments,
      request: tribunalRequest,
      stderr,
      writeFile: input.writeFile,
    });
    const onProgress = createProgressHandler({
      intermediateOutputRecorder,
      progressReporter,
    });
    const runTribunalOptions: {
      environment: Record<string, string | undefined>;
      onProgress?: TribunalProgressHandler;
    } = { environment };

    if (onProgress !== undefined) {
      runTribunalOptions.onProgress = onProgress;
    }

    const response = await runTribunal(tribunalRequest, runTribunalOptions);
    const responseWithContextWarnings = appendWarnings(response, loadedContext.warnings);
    await intermediateOutputRecorder?.markCompleted(responseWithContextWarnings);

    stdout.write(
      `${formatOutput(responseWithContextWarnings, {
        outputFormat: parsedArguments.outputFormat,
        showPerspectives: parsedArguments.showPerspectives,
      })}\n`,
    );

    await writeAndOpenHtmlReport({
      cwd,
      now: input.now,
      openHtmlReport: input.openHtmlReport,
      parsedArguments,
      request: tribunalRequest,
      response: responseWithContextWarnings,
      stderr,
      writeHtmlReport: input.writeHtmlReport,
    });

    if (parsedArguments.verbose) {
      writeWarnings(stderr, responseWithContextWarnings.metadata.warnings);
    }

    return 0;
  } catch (error) {
    try {
      await intermediateOutputRecorder?.markFailed(error);
    } catch (recordingError) {
      stderr.write(
        `Warning: Failed to persist failure snapshot: ${formatErrorMessage(recordingError)}\n`,
      );
    }

    stderr.write(`Error: ${formatErrorMessage(error)}\n`);
    return 1;
  } finally {
    progressReporter?.stop();
  }
}

function tryApplyHtmlFlag(input: {
  argv: readonly string[];
  argument: string;
  index: number;
  state: HtmlFlagState;
}): number {
  const { argument, argv, index, state } = input;

  if (argument === "--html") {
    state.htmlReportFilePath = readFlagValue({ argv, flag: argument, index });
    state.shouldWriteHtmlReport = true;
    return 1;
  }

  if (argument === "--no-html") {
    state.shouldWriteHtmlReport = false;
    state.htmlReportFilePath = undefined;
    return 0;
  }

  if (argument === "--no-open") {
    state.shouldOpenHtmlReport = false;
    return 0;
  }

  return -1;
}

function readFlagValue(input: { argv: readonly string[]; index: number; flag: string }): string {
  const value = input.argv[input.index + 1];

  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${input.flag}`);
  }

  return value;
}

function parseOutputFormat(input: string): OutputFormat {
  switch (input) {
    case "text": {
      return input;
    }
    case "json": {
      return input;
    }
    case "markdown": {
      return input;
    }
    default: {
      throw new Error(`Unknown output format: ${input}`);
    }
  }
}

function assignParsedContext(arguments_: ParsedCliArguments, context: string | undefined): void {
  if (context === undefined) {
    return;
  }

  arguments_.context = context;
}

function assignParsedContextFilePath(
  arguments_: ParsedCliArguments,
  contextFilePath: string | undefined,
): void {
  if (contextFilePath === undefined) {
    return;
  }

  arguments_.contextFilePath = contextFilePath;
}

function assignParsedIntermediateOutputFilePath(
  arguments_: ParsedCliArguments,
  intermediateOutputFilePath: string | undefined,
): void {
  if (intermediateOutputFilePath === undefined) {
    return;
  }

  arguments_.intermediateOutputFilePath = intermediateOutputFilePath;
}

function assignParsedHtmlReportFilePath(
  arguments_: ParsedCliArguments,
  htmlReportFilePath: string | undefined,
): void {
  if (htmlReportFilePath === undefined) {
    return;
  }

  arguments_.htmlReportFilePath = htmlReportFilePath;
}

function createLoadContextInput(input: {
  cwd: string;
  parsedArguments: ParsedCliArguments;
  readFile: LoadContextInput["readFile"] | undefined;
}): LoadContextInput {
  const { cwd, parsedArguments, readFile } = input;
  const loadContextInput: LoadContextInput = { cwd };

  if (parsedArguments.contextFilePath !== undefined) {
    loadContextInput.contextFilePath = parsedArguments.contextFilePath;
  }

  if (parsedArguments.context !== undefined) {
    loadContextInput.inlineContext = parsedArguments.context;
  }

  if (readFile !== undefined) {
    loadContextInput.readFile = readFile;
  }

  return loadContextInput;
}

function createTribunalRequest(
  parsedArguments: ParsedCliArguments,
  loadedContext: LoadedContext,
): TribunalRequest {
  const request: TribunalRequest = {
    query: parsedArguments.query,
    models: parsedArguments.models,
    reasoning: parsedArguments.reasoning,
    showPerspectives: parsedArguments.showPerspectives,
  };

  if (loadedContext.context !== undefined) {
    request.context = loadedContext.context;
  }

  return request;
}

function appendWarnings(response: TribunalResponse, warnings: string[]): TribunalResponse {
  if (warnings.length === 0) {
    return response;
  }

  return {
    ...response,
    metadata: {
      ...response.metadata,
      warnings: [...warnings, ...response.metadata.warnings],
    },
  };
}

function writeWarnings(stderr: TextWritable, warnings: string[]): void {
  for (const warning of warnings) {
    stderr.write(`Warning: ${warning}\n`);
  }
}

async function createCliIntermediateOutputRecorder(input: {
  cwd: string;
  makeDirectory: CreateIntermediateOutputRecorderInput["makeDirectory"] | undefined;
  now: (() => Date) | undefined;
  parsedArguments: ParsedCliArguments;
  request: TribunalRequest;
  stderr: TextWritable;
  writeFile: CreateIntermediateOutputRecorderInput["writeFile"] | undefined;
}): Promise<IntermediateOutputRecorder | undefined> {
  const { cwd, makeDirectory, now, parsedArguments, request, stderr, writeFile } = input;

  if (!parsedArguments.shouldSaveIntermediates) {
    return undefined;
  }

  const filePath = resolveIntermediateOutputFilePath({ cwd, now, parsedArguments });
  const recorderInput: CreateIntermediateOutputRecorderInput = { filePath, request };

  if (makeDirectory !== undefined) {
    recorderInput.makeDirectory = makeDirectory;
  }

  if (writeFile !== undefined) {
    recorderInput.writeFile = writeFile;
  }

  if (now !== undefined) {
    recorderInput.now = now;
  }

  const recorder = await createIntermediateOutputRecorder(recorderInput);

  stderr.write(`Saving intermediate outputs to ${filePath}\n`);

  return recorder;
}

function resolveIntermediateOutputFilePath(input: {
  cwd: string;
  now: (() => Date) | undefined;
  parsedArguments: ParsedCliArguments;
}): string {
  const { cwd, now, parsedArguments } = input;

  if (parsedArguments.intermediateOutputFilePath !== undefined) {
    return resolve(cwd, parsedArguments.intermediateOutputFilePath);
  }

  if (now === undefined) {
    return createDefaultIntermediateOutputPath({ cwd });
  }

  return createDefaultIntermediateOutputPath({ cwd, now });
}

const HTML_REPORT_DIRECTORY = ".tribunal/reports";

async function writeAndOpenHtmlReport(input: {
  cwd: string;
  now: (() => Date) | undefined;
  openHtmlReport: ((filePath: string) => Promise<void>) | undefined;
  parsedArguments: ParsedCliArguments;
  request: TribunalRequest;
  response: TribunalResponse;
  stderr: TextWritable;
  writeHtmlReport: ((filePath: string, html: string) => Promise<void>) | undefined;
}): Promise<void> {
  const { cwd, now, openHtmlReport, parsedArguments, request, response, stderr, writeHtmlReport } =
    input;

  if (!parsedArguments.shouldWriteHtmlReport) {
    return;
  }

  const generatedAt = now === undefined ? new Date() : now();
  const filePath = resolveHtmlReportFilePath({ cwd, generatedAt, parsedArguments });
  const html = renderHtmlReport({
    generatedAt,
    query: request.query,
    response,
    ...(request.context === undefined ? {} : { context: request.context }),
  });
  const writer = writeHtmlReport ?? defaultWriteHtmlReport;

  try {
    await writer(filePath, html);
    stderr.write(`Wrote HTML report to ${filePath}\n`);
  } catch (error) {
    stderr.write(`Warning: Failed to write HTML report: ${formatErrorMessage(error)}\n`);
    return;
  }

  if (!parsedArguments.shouldOpenHtmlReport) {
    return;
  }

  const opener = openHtmlReport ?? defaultOpenHtmlReport;

  try {
    await opener(filePath);
  } catch (error) {
    stderr.write(`Warning: Failed to open HTML report: ${formatErrorMessage(error)}\n`);
  }
}

function resolveHtmlReportFilePath(input: {
  cwd: string;
  generatedAt: Date;
  parsedArguments: ParsedCliArguments;
}): string {
  const { cwd, generatedAt, parsedArguments } = input;

  if (parsedArguments.htmlReportFilePath !== undefined) {
    return resolve(cwd, parsedArguments.htmlReportFilePath);
  }

  const timestamp = generatedAt.toISOString().replaceAll(":", "-").replaceAll(".", "-");
  return resolve(cwd, HTML_REPORT_DIRECTORY, `${timestamp}.html`);
}

async function defaultWriteHtmlReport(filePath: string, html: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFileToDisk(filePath, html, "utf8");
}

async function defaultOpenHtmlReport(filePath: string): Promise<void> {
  const { command, args } = getOpenCommand(filePath);
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", () => {
    // Swallow spawn errors (e.g., open/xdg-open not installed); the file was still written.
  });
  child.unref();
}

function getOpenCommand(filePath: string): { command: string; args: string[] } {
  if (process.platform === "darwin") {
    return { command: "open", args: [filePath] };
  }

  if (process.platform === "win32") {
    return { command: "cmd", args: ["/c", "start", "", filePath] };
  }

  return { command: "xdg-open", args: [filePath] };
}

function createProgressHandler(input: {
  progressReporter: CliProgressReporter | undefined;
  intermediateOutputRecorder: IntermediateOutputRecorder | undefined;
}): TribunalProgressHandler | undefined {
  const { intermediateOutputRecorder, progressReporter } = input;

  if (progressReporter === undefined && intermediateOutputRecorder === undefined) {
    return undefined;
  }

  return async (event) => {
    await progressReporter?.onProgress(event);
    await intermediateOutputRecorder?.onProgress(event);
  };
}

function createCliProgressReporter(input: {
  intervalMs: number;
  stderr: TextWritable;
}): CliProgressReporter {
  const { intervalMs, stderr } = input;
  const activeRoles = new Set<ModelRole>();
  let interval: ReturnType<typeof setInterval> | undefined;
  let hasOpenDotLine = false;

  function onProgress(event: TribunalProgressEvent): void {
    if (event.status === "started") {
      activeRoles.add(event.role);
      writeProgressLine(`Starting ${event.role} (${formatModelSpec(event.model)})...`);
      startTimer();
      return;
    }

    if (event.status === "completed") {
      activeRoles.delete(event.role);
      writeProgressLine(`Finished ${event.role} in ${formatProgressDuration(event.latencyMs)}.`);
      stopTimerIfIdle();
      return;
    }

    activeRoles.delete(event.role);
    writeProgressLine(`Failed ${event.role} (${formatModelSpec(event.model)}).`);
    stopTimerIfIdle();
  }

  function startTimer(): void {
    if (interval !== undefined) {
      return;
    }

    interval = setInterval(writeProgressTick, intervalMs);
  }

  function writeProgressTick(): void {
    if (activeRoles.size === 0) {
      return;
    }

    stderr.write(".");
    hasOpenDotLine = true;
  }

  function writeProgressLine(line: string): void {
    if (hasOpenDotLine) {
      stderr.write("\n");
      hasOpenDotLine = false;
    }

    stderr.write(`${line}\n`);
  }

  function stopTimerIfIdle(): void {
    if (activeRoles.size > 0) {
      return;
    }

    stop();
  }

  function stop(): void {
    if (interval !== undefined) {
      clearInterval(interval);
      interval = undefined;
    }

    if (!hasOpenDotLine) {
      return;
    }

    stderr.write("\n");
    hasOpenDotLine = false;
  }

  return { onProgress, stop };
}

function formatProgressDuration(latencyMs: number | undefined): string {
  if (latencyMs === undefined) {
    return "unknown duration";
  }

  if (latencyMs < 1000) {
    return `${Math.round(latencyMs)}ms`;
  }

  return `${formatSeconds(latencyMs / 1000)}s`;
}

function formatSeconds(seconds: number): string {
  if (seconds < 10) {
    return seconds.toFixed(1);
  }

  return `${Math.round(seconds)}`;
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMainModule(argv: readonly string[], moduleUrl: string): boolean {
  const [, entryPoint] = argv;

  if (entryPoint === undefined) {
    return false;
  }

  return pathToFileURL(resolve(entryPoint)).href === moduleUrl;
}

/* v8 ignore next @preserve */
if (isMainModule(process.argv, import.meta.url)) {
  process.exitCode = await runCli();
}
