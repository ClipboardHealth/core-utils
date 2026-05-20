import { formatModelSpec } from "./models.ts";
import type { OutputFormat, PerspectiveOutput, TribunalResponse } from "./tribunal.ts";

export interface FormatOutputInput {
  outputFormat: OutputFormat;
  showPerspectives: boolean;
}

export function formatOutput(response: TribunalResponse, input: FormatOutputInput): string {
  const { outputFormat, showPerspectives } = input;

  switch (outputFormat) {
    case "json": {
      return JSON.stringify(response, undefined, 2);
    }
    case "markdown": {
      return formatMarkdownOutput(response, showPerspectives);
    }
    case "text": {
      return formatTextOutput(response, showPerspectives);
    }
    default: {
      throw new Error("Unsupported output format.");
    }
  }
}

function formatTextOutput(response: TribunalResponse, showPerspectives: boolean): string {
  const sections = [
    "Tribunal",
    `Answer\n${response.result.answer}`,
    `Recommendation\n${response.result.recommendation ?? "No recommendation."}`,
    `Key takeaways\n${formatNumberedList(response.result.keyTakeaways)}`,
    `Consensus\n${formatBulletedList(response.result.consensus)}`,
    `Disagreements\n${formatBulletedList(response.result.disagreements)}`,
    `Confidence: ${formatConfidence(response.result.confidence)}`,
    `Caveats\n${formatBulletedList(response.result.caveats)}`,
    `Open questions\n${formatBulletedList(response.result.openQuestions)}`,
    formatTextMetadata(response),
  ];

  if (showPerspectives) {
    sections.push(...response.perspectives.map(formatTextPerspective));
  }

  return sections.join("\n\n");
}

function formatMarkdownOutput(response: TribunalResponse, showPerspectives: boolean): string {
  const sections = [
    "# Tribunal",
    `## Answer\n\n${response.result.answer}`,
    `## Recommendation\n\n${response.result.recommendation ?? "No recommendation."}`,
    `## Key takeaways\n\n${formatNumberedList(response.result.keyTakeaways)}`,
    `## Consensus\n\n${formatBulletedList(response.result.consensus)}`,
    `## Disagreements\n\n${formatBulletedList(response.result.disagreements)}`,
    `## Confidence\n\n${formatConfidence(response.result.confidence)}`,
    `## Caveats\n\n${formatBulletedList(response.result.caveats)}`,
    `## Open questions\n\n${formatBulletedList(response.result.openQuestions)}`,
    formatMarkdownMetadata(response),
  ];

  if (showPerspectives) {
    sections.push(...response.perspectives.map(formatMarkdownPerspective));
  }

  return sections.join("\n\n");
}

function formatTextPerspective(perspective: PerspectiveOutput): string {
  return `Perspective: ${capitalize(perspective.role)}
Summary: ${perspective.result.summary}
Claims:
${perspective.result.claims.map(formatTextClaim).join("\n")}
Open questions:
${formatBulletedList(perspective.result.openQuestions)}`;
}

function formatMarkdownPerspective(perspective: PerspectiveOutput): string {
  return `## Perspective: ${capitalize(perspective.role)}

Summary: ${perspective.result.summary}

### Claims

${perspective.result.claims.map(formatMarkdownClaim).join("\n")}

### Open questions

${formatBulletedList(perspective.result.openQuestions)}`;
}

function formatTextClaim(claim: PerspectiveOutput["result"]["claims"][number]): string {
  const assumptions =
    claim.assumptions.length === 0 ? "" : ` Assumptions: ${claim.assumptions.join("; ")}`;

  return `- ${claim.claim} (${formatConfidence(claim.confidence)}): ${claim.reasoning}${assumptions}`;
}

function formatMarkdownClaim(claim: PerspectiveOutput["result"]["claims"][number]): string {
  const assumptions =
    claim.assumptions.length === 0 ? "" : ` Assumptions: ${claim.assumptions.join("; ")}`;

  return `- **${claim.claim}** (${formatConfidence(claim.confidence)}): ${claim.reasoning}${assumptions}`;
}

function formatTextMetadata(response: TribunalResponse): string {
  return `Metadata
Models: ${formatModels(response)}
Reasoning: ${formatReasoning(response)}
Tokens: ${formatTokenUsage(response)}
Cost: ${formatCost(response.metadata.estimatedCostUsd)}
Latency: ${formatLatency(response.metadata.latencyMs)}
Warnings: ${formatInlineWarnings(response.metadata.warnings)}`;
}

function formatMarkdownMetadata(response: TribunalResponse): string {
  return `## Metadata

- Models: ${formatModels(response)}
- Reasoning: ${formatReasoning(response)}
- Tokens: ${formatTokenUsage(response)}
- Cost: ${formatCost(response.metadata.estimatedCostUsd)}
- Latency: ${formatLatency(response.metadata.latencyMs)}
- Warnings: ${formatInlineWarnings(response.metadata.warnings)}`;
}

function formatModels(response: TribunalResponse): string {
  const { models } = response.metadata;

  return [
    `advocate=${formatModelSpec(models.advocate)}`,
    `skeptic=${formatModelSpec(models.skeptic)}`,
    `analyst=${formatModelSpec(models.analyst)}`,
    `deliberator=${formatModelSpec(models.deliberator)}`,
  ].join(", ");
}

function formatReasoning(response: TribunalResponse): string {
  const { reasoning } = response.metadata;

  if (reasoning === undefined) {
    return "default";
  }

  const parts: string[] = [];

  addReasoningPart(parts, "advocate", reasoning.advocate);
  addReasoningPart(parts, "skeptic", reasoning.skeptic);
  addReasoningPart(parts, "analyst", reasoning.analyst);
  addReasoningPart(parts, "deliberator", reasoning.deliberator);

  if (parts.length === 0) {
    return "default";
  }

  return parts.join(", ");
}

function formatTokenUsage(response: TribunalResponse): string {
  const { totalUsage } = response.metadata;

  if (totalUsage === undefined) {
    return "unknown";
  }

  const parts: string[] = [];

  addTokenUsagePart(parts, "input", totalUsage.inputTokens);
  addTokenUsagePart(parts, "output", totalUsage.outputTokens);
  addTokenUsagePart(parts, "total", totalUsage.totalTokens);

  return parts.join(", ");
}

function formatCost(estimatedCostUsd: number | null): string {
  if (estimatedCostUsd === null) {
    return "unknown";
  }

  return `$${estimatedCostUsd.toFixed(6)}`;
}

function formatLatency(latencyMs: number): string {
  if (latencyMs >= 1000) {
    return `${(latencyMs / 1000).toFixed(1)}s`;
  }

  return `${latencyMs}ms`;
}

function formatNumberedList(items: string[]): string {
  if (items.length === 0) {
    return "none";
  }

  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function formatBulletedList(items: string[]): string {
  if (items.length === 0) {
    return "- none";
  }

  return items.map((item) => `- ${item}`).join("\n");
}

function formatInlineWarnings(warnings: string[]): string {
  if (warnings.length === 0) {
    return "none";
  }

  return warnings.join("; ");
}

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function capitalize(input: string): string {
  return `${input.slice(0, 1).toUpperCase()}${input.slice(1)}`;
}

function addTokenUsagePart(parts: string[], label: string, value: number | undefined): void {
  if (value === undefined) {
    return;
  }

  parts.push(`${label}=${value}`);
}

function addReasoningPart(parts: string[], role: string, value: string | undefined): void {
  if (value === undefined) {
    return;
  }

  parts.push(`${role}=${value}`);
}
