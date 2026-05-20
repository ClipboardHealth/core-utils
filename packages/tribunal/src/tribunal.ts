import { generateText, type LanguageModelUsage, Output } from "ai";
import type { z } from "zod";

import {
  formatModelSpec,
  type ModelRole,
  type ModelSpec,
  resolveLanguageModel,
  resolveModelSet,
  type ResolveModelSetInput,
} from "./models.ts";
import {
  createReasoningProviderOptions,
  type ReasoningLevel,
  type ReasoningOverrides,
} from "./reasoning.ts";
import {
  type DeliberationResult,
  deliberationResultSchema,
  generatedDeliberationResultSchema,
  generatedPerspectiveResultSchema,
  type PerspectiveResult,
  perspectiveResultSchema,
  type Role,
} from "./schemas.ts";

export type OutputFormat = "text" | "json" | "markdown";

export interface TribunalRequest {
  query: string;
  context?: string;
  models?: Partial<Record<ModelRole, ModelSpec>>;
  reasoning?: ReasoningOverrides;
  showPerspectives?: boolean;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface CallMetadata {
  model: ModelSpec;
  latencyMs: number;
  usage?: TokenUsage;
}

export interface PerspectiveOutput {
  role: Role;
  result: PerspectiveResult;
  metadata: CallMetadata;
}

export interface TribunalResponse {
  result: DeliberationResult;
  perspectives: PerspectiveOutput[];
  metadata: {
    models: Record<ModelRole, ModelSpec>;
    reasoning?: ReasoningOverrides;
    totalUsage?: TokenUsage;
    estimatedCostUsd: number | null;
    latencyMs: number;
    warnings: string[];
  };
}

export type TribunalProgressStatus = "started" | "completed" | "failed";

export interface TribunalProgressEvent {
  role: ModelRole;
  status: TribunalProgressStatus;
  model: ModelSpec;
  latencyMs?: number;
  metadata?: CallMetadata;
  output?: unknown;
  errorMessage?: string;
}

export type TribunalProgressHandler = (event: TribunalProgressEvent) => void | Promise<void>;

interface StructuredOutputRunnerInput {
  role: ModelRole;
  reasoningLevel?: ReasoningLevel | undefined;
  model: ModelSpec;
  system: string;
  prompt: string;
  schema: z.ZodType;
}

interface StructuredOutputRunnerResult {
  output: unknown;
  metadata: CallMetadata;
}

export type StructuredOutputRunner = (
  input: StructuredOutputRunnerInput,
) => Promise<StructuredOutputRunnerResult>;

interface RunTribunalOptions {
  structuredOutputRunner?: StructuredOutputRunner;
  onProgress?: TribunalProgressHandler;
  now?: () => number;
}

export interface StructuredOutputInput<T> {
  model: ModelSpec;
  reasoningLevel?: ReasoningLevel | undefined;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
}

export interface StructuredOutputResult<T> {
  output: T;
  metadata: CallMetadata;
}

export interface CostEstimateCall {
  role: ModelRole;
  metadata: CallMetadata;
}

export interface CostEstimate {
  estimatedCostUsd: number | null;
  warning?: string;
}

const MAX_WARNINGS_TO_LIST = 3;

const DEFAULT_PERSPECTIVES = [
  {
    role: "advocate",
    system:
      "Argue the strongest reasonable case FOR the proposal. Focus on benefits, upside, why it could work, and what would need to be true.",
  },
  {
    role: "skeptic",
    system:
      "Argue the strongest reasonable case AGAINST the proposal. Focus on risks, hidden costs, failure modes, and reasons it may not work.",
  },
  {
    role: "analyst",
    system:
      "Analyze the proposal neutrally. Map the decision space, tradeoffs, criteria, dependencies, and unknowns without taking a side.",
  },
] as const;

const DELIBERATOR_SYSTEM_PROMPT = `You are a deliberator comparing multiple structured perspectives.

Evaluate claims on their merits, not based on model/provider identity.
Identify true consensus, important disagreements, assumptions, and decision criteria.
Do not simply summarize each perspective.
Produce a balanced answer with a clear recommendation when the evidence supports one.
If the answer depends on missing information, say what information would change the recommendation.`;

const MODEL_PRICING_USD_PER_1M_TOKENS: Record<
  string,
  { inputUsdPerMillionTokens: number; outputUsdPerMillionTokens: number }
> = {};

export async function runTribunal(
  request: TribunalRequest,
  options: RunTribunalOptions = {},
): Promise<TribunalResponse> {
  const now = options.now ?? performance.now.bind(performance);
  const start = now();
  const structuredOutputRunner = options.structuredOutputRunner ?? defaultStructuredOutputRunner;
  const models = resolveModelSet(createResolveModelSetInput(request.models));
  const reasoning = copyReasoningOverrides(request.reasoning);
  const warnings: string[] = [];
  const prompt = buildQuestionPrompt(createPromptInput(request.query, request.context));

  const settledPerspectives = await Promise.allSettled(
    DEFAULT_PERSPECTIVES.map(
      async (perspective) =>
        await runPerspective({
          model: models[perspective.role],
          onProgress: options.onProgress,
          perspective,
          prompt,
          reasoningLevel: reasoning?.[perspective.role],
          structuredOutputRunner,
        }),
    ),
  );

  const perspectives = collectSuccessfulPerspectives(settledPerspectives, warnings);

  if (perspectives.length < 2) {
    throw new Error(
      `At least two perspectives must succeed before deliberation. Received ${perspectives.length}.`,
    );
  }

  const deliberation = await runStructuredOutputWithProgress({
    model: models.deliberator,
    onProgress: options.onProgress,
    prompt: buildDeliberatorPrompt(
      createDeliberatorPromptInput(request.query, request.context, perspectives),
    ),
    reasoningLevel: reasoning?.deliberator,
    role: "deliberator",
    schema: generatedDeliberationResultSchema,
    structuredOutputRunner,
    system: DELIBERATOR_SYSTEM_PROMPT,
  });
  const result = deliberationResultSchema.parse(deliberation.output);
  const allCalls: CostEstimateCall[] = [
    ...perspectives.map((perspective) => ({
      metadata: perspective.metadata,
      role: perspective.role,
    })),
    { metadata: deliberation.metadata, role: "deliberator" },
  ];
  const costEstimate = estimateCostUsd(allCalls);

  if (costEstimate.warning !== undefined) {
    warnings.push(costEstimate.warning);
  }

  const totalUsage = sumTokenUsage(allCalls.map((call) => call.metadata.usage ?? {}));

  const metadata: TribunalResponse["metadata"] = {
    models,
    estimatedCostUsd: costEstimate.estimatedCostUsd,
    latencyMs: Math.round(now() - start),
    warnings,
  };

  if (reasoning !== undefined) {
    metadata.reasoning = reasoning;
  }

  if (totalUsage !== undefined) {
    metadata.totalUsage = totalUsage;
  }

  return {
    result,
    perspectives,
    metadata,
  };
}

export async function runStructuredOutput<T>(
  input: StructuredOutputInput<T>,
): Promise<StructuredOutputResult<T>> {
  const { model, prompt, reasoningLevel, schema, system } = input;
  const start = performance.now();
  const providerOptions = createReasoningProviderOptions({ model, reasoningLevel });

  const result = await generateText({
    model: resolveLanguageModel(model),
    output: Output.object({ schema }),
    prompt,
    ...(providerOptions === undefined ? {} : { providerOptions }),
    system,
  });

  return {
    output: result.output,
    metadata: {
      model,
      latencyMs: Math.round(performance.now() - start),
      usage: normalizeUsage(result.usage),
    },
  };
}

export function normalizeUsage(usage: LanguageModelUsage): TokenUsage {
  const normalizedUsage: TokenUsage = {};

  assignTokenUsage(normalizedUsage, "inputTokens", usage.inputTokens);
  assignTokenUsage(normalizedUsage, "outputTokens", usage.outputTokens);
  assignTokenUsage(normalizedUsage, "totalTokens", usage.totalTokens);

  return normalizedUsage;
}

export function sumTokenUsage(usages: TokenUsage[]): TokenUsage | undefined {
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let hasInputTokens = false;
  let hasOutputTokens = false;
  let hasTotalTokens = false;

  for (const usage of usages) {
    if (usage.inputTokens !== undefined) {
      inputTokens += usage.inputTokens;
      hasInputTokens = true;
    }

    if (usage.outputTokens !== undefined) {
      outputTokens += usage.outputTokens;
      hasOutputTokens = true;
    }

    if (usage.totalTokens !== undefined) {
      totalTokens += usage.totalTokens;
      hasTotalTokens = true;
    }
  }

  if (!hasInputTokens && !hasOutputTokens && !hasTotalTokens) {
    return undefined;
  }

  return {
    ...(hasInputTokens ? { inputTokens } : {}),
    ...(hasOutputTokens ? { outputTokens } : {}),
    ...(hasTotalTokens ? { totalTokens } : {}),
  };
}

function assignTokenUsage(
  usage: TokenUsage,
  key: keyof TokenUsage,
  value: number | undefined,
): void {
  if (value === undefined) {
    return;
  }

  usage[key] = value;
}

function createResolveModelSetInput(
  overrides: Partial<Record<ModelRole, ModelSpec>> | undefined,
): ResolveModelSetInput {
  const input: ResolveModelSetInput = {};

  if (overrides === undefined) {
    return input;
  }

  input.overrides = overrides;
  return input;
}

function createPromptInput(
  query: string,
  context: string | undefined,
): {
  query: string;
  context?: string;
} {
  if (context === undefined) {
    return { query };
  }

  return { query, context };
}

function createDeliberatorPromptInput(
  query: string,
  context: string | undefined,
  perspectives: PerspectiveOutput[],
): {
  query: string;
  context?: string;
  perspectives: PerspectiveOutput[];
} {
  if (context === undefined) {
    return { query, perspectives };
  }

  return { query, context, perspectives };
}

export function estimateCostUsd(calls: CostEstimateCall[]): CostEstimate {
  const modelsWithUnknownPricing = new Set<string>();

  for (const call of calls) {
    const modelKey = formatModelSpec(call.metadata.model);
    const pricing = MODEL_PRICING_USD_PER_1M_TOKENS[modelKey];

    if (pricing === undefined) {
      modelsWithUnknownPricing.add(modelKey);
    }
  }

  if (modelsWithUnknownPricing.size > 0) {
    return {
      estimatedCostUsd: null,
      warning: `Cost estimate unavailable because pricing is unknown for ${formatLimitedList([
        ...modelsWithUnknownPricing,
      ])}.`,
    };
  }

  let estimatedCostUsd = 0;

  for (const call of calls) {
    const {
      metadata: { usage },
    } = call;

    if (usage?.inputTokens === undefined || usage.outputTokens === undefined) {
      return {
        estimatedCostUsd: null,
        warning: "Cost estimate unavailable because token usage was not returned.",
      };
    }

    const pricing = MODEL_PRICING_USD_PER_1M_TOKENS[formatModelSpec(call.metadata.model)];

    if (pricing === undefined) {
      return {
        estimatedCostUsd: null,
        warning: "Cost estimate unavailable because model pricing changed during calculation.",
      };
    }

    estimatedCostUsd +=
      (usage.inputTokens / 1_000_000) * pricing.inputUsdPerMillionTokens +
      (usage.outputTokens / 1_000_000) * pricing.outputUsdPerMillionTokens;
  }

  return { estimatedCostUsd };
}

async function defaultStructuredOutputRunner(
  input: StructuredOutputRunnerInput,
): Promise<StructuredOutputRunnerResult> {
  const { model, prompt, reasoningLevel, schema, system } = input;

  return await runStructuredOutput({ model, prompt, reasoningLevel, schema, system });
}

async function runPerspective(input: {
  perspective: (typeof DEFAULT_PERSPECTIVES)[number];
  model: ModelSpec;
  onProgress: TribunalProgressHandler | undefined;
  prompt: string;
  reasoningLevel: ReasoningLevel | undefined;
  structuredOutputRunner: StructuredOutputRunner;
}): Promise<PerspectiveOutput> {
  const { model, onProgress, perspective, prompt, reasoningLevel, structuredOutputRunner } = input;
  const output = await runStructuredOutputWithProgress({
    model,
    onProgress,
    prompt,
    reasoningLevel,
    role: perspective.role,
    schema: generatedPerspectiveResultSchema,
    structuredOutputRunner,
    system: perspective.system,
  });
  const result = perspectiveResultSchema.parse(output.output);

  if (result.role !== perspective.role) {
    throw new Error(
      `Perspective role mismatch: expected ${perspective.role}, received ${result.role}.`,
    );
  }

  return {
    role: perspective.role,
    result,
    metadata: output.metadata,
  };
}

async function runStructuredOutputWithProgress(input: {
  role: ModelRole;
  reasoningLevel?: ReasoningLevel | undefined;
  model: ModelSpec;
  onProgress: TribunalProgressHandler | undefined;
  system: string;
  prompt: string;
  schema: z.ZodType;
  structuredOutputRunner: StructuredOutputRunner;
}): Promise<StructuredOutputRunnerResult> {
  const {
    model,
    onProgress,
    prompt,
    reasoningLevel,
    role,
    schema,
    structuredOutputRunner,
    system,
  } = input;
  const runnerInput: StructuredOutputRunnerInput = {
    model,
    prompt,
    reasoningLevel,
    role,
    schema,
    system,
  };

  await emitProgress(onProgress, { model, role, status: "started" });

  try {
    const output = await structuredOutputRunner(runnerInput);

    await emitProgress(onProgress, {
      latencyMs: output.metadata.latencyMs,
      metadata: output.metadata,
      model,
      output: output.output,
      role,
      status: "completed",
    });

    return output;
  } catch (error) {
    await emitProgress(onProgress, {
      errorMessage: formatErrorMessage(error),
      model,
      role,
      status: "failed",
    });
    throw error;
  }
}

async function emitProgress(
  onProgress: TribunalProgressHandler | undefined,
  event: TribunalProgressEvent,
): Promise<void> {
  if (onProgress === undefined) {
    return;
  }

  try {
    await onProgress(event);
  } catch {
    // Progress hooks are best-effort; recorder or logger failures must not abort model calls.
  }
}

function collectSuccessfulPerspectives(
  settledPerspectives: PromiseSettledResult<PerspectiveOutput>[],
  warnings: string[],
): PerspectiveOutput[] {
  const perspectives: PerspectiveOutput[] = [];

  for (const [index, settledPerspective] of settledPerspectives.entries()) {
    const perspective = DEFAULT_PERSPECTIVES[index];

    if (settledPerspective === undefined || perspective === undefined) {
      continue;
    }

    if (settledPerspective.status === "fulfilled") {
      perspectives.push(settledPerspective.value);
      continue;
    }

    warnings.push(
      `${perspective.role} perspective failed: ${formatErrorMessage(settledPerspective.reason)}`,
    );
  }

  return perspectives;
}

function buildQuestionPrompt(input: { query: string; context?: string }): string {
  const { context, query } = input;

  if (context === undefined || context.trim().length === 0) {
    return `Question:
${query}

Context:
No additional context provided.`;
  }

  return `Question:
${query}

Context:
${context}`;
}

function buildDeliberatorPrompt(input: {
  query: string;
  context?: string;
  perspectives: PerspectiveOutput[];
}): string {
  const { context, perspectives, query } = input;
  const contextText =
    context === undefined || context.trim().length === 0
      ? "No additional context provided."
      : context;

  return `Question:
${query}

Context:
${contextText}

Perspectives:
${perspectives.map(formatPerspectiveForDeliberator).join("\n\n")}`;
}

function formatPerspectiveForDeliberator(perspective: PerspectiveOutput): string {
  const claims = perspective.result.claims
    .map(
      (claim) =>
        `  - ${claim.claim} (confidence ${formatConfidence(claim.confidence)}): ${claim.reasoning}`,
    )
    .join("\n");
  const openQuestions =
    perspective.result.openQuestions.length === 0
      ? "  - none"
      : perspective.result.openQuestions.map((question) => `  - ${question}`).join("\n");

  return `- ${perspective.role}: ${perspective.result.summary}
  Claims:
${claims}
  Open questions:
${openQuestions}`;
}

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatLimitedList(items: string[]): string {
  const sortedItems = items.toSorted();
  const displayedItems = sortedItems.slice(0, MAX_WARNINGS_TO_LIST);
  const remainingCount = sortedItems.length - displayedItems.length;

  if (remainingCount === 0) {
    return displayedItems.join(", ");
  }

  return `${displayedItems.join(", ")} and ${remainingCount} more`;
}

function copyReasoningOverrides(
  overrides: ReasoningOverrides | undefined,
): ReasoningOverrides | undefined {
  if (overrides === undefined) {
    return undefined;
  }

  const copiedOverrides: ReasoningOverrides = {};

  copyReasoningOverride(copiedOverrides, overrides, "advocate");
  copyReasoningOverride(copiedOverrides, overrides, "skeptic");
  copyReasoningOverride(copiedOverrides, overrides, "analyst");
  copyReasoningOverride(copiedOverrides, overrides, "deliberator");

  if (
    copiedOverrides.advocate === undefined &&
    copiedOverrides.skeptic === undefined &&
    copiedOverrides.analyst === undefined &&
    copiedOverrides.deliberator === undefined
  ) {
    return undefined;
  }

  return copiedOverrides;
}

function copyReasoningOverride(
  target: ReasoningOverrides,
  source: ReasoningOverrides,
  role: ModelRole,
): void {
  const level = source[role];

  if (level === undefined) {
    return;
  }

  target[role] = level;
}
