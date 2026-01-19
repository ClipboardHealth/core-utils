#!/usr/bin/env node
/**
 * Hook: Spec Drift Detection
 *
 * PreToolUse hook that detects when coder agent tries to modify specs or interfaces.
 * Blocks the edit and instructs to delegate to product-manager agent.
 *
 * This enforces the separation of concerns where only product-manager
 * can modify specifications and acceptance criteria.
 *
 * Uses only Node.js native functions (zero external dependencies at runtime).
 */

import {
  allowToolUse,
  denyToolUse,
  outputHookResponse,
  type PreToolUseInput,
  readHookInput,
} from "../../lib/hooks.ts";

interface ToolInputWithFilePath {
  file_path?: string;
}

const TICKET_FILE_PATTERN = /\/docs\/\d{4}-\d{2}-[^/]+\/\d+-.*\.md$/;

function isProductBrief(filePath: string): boolean {
  return filePath.endsWith("/product-brief.md");
}

function isTechnicalDesign(filePath: string): boolean {
  return filePath.endsWith("/technical-design.md");
}

function isTicketFile(filePath: string): boolean {
  return TICKET_FILE_PATTERN.test(filePath);
}

function isSharedInterfaceFile(filePath: string): boolean {
  const isInterfaceFile =
    filePath.endsWith("/interface.ts") ||
    filePath.endsWith("/interfaces.ts") ||
    filePath.endsWith("/contracts.ts");

  const isSharedTypesFile = filePath.endsWith("/types.ts") && filePath.includes("/src/shared/");

  return isInterfaceFile || isSharedTypesFile;
}

async function main(): Promise<void> {
  const input = await readHookInput<PreToolUseInput>();

  if (!input) {
    outputHookResponse(allowToolUse());
    return;
  }

  const toolInput = input.tool_input as ToolInputWithFilePath;
  const filePath = toolInput.file_path;

  if (!filePath) {
    outputHookResponse(allowToolUse());
    return;
  }

  // 1. Product briefs - block modification
  if (isProductBrief(filePath)) {
    outputHookResponse(
      denyToolUse(
        "Cannot modify product brief directly. Delegate to product-manager agent for spec changes.",
      ),
    );
    return;
  }

  // 2. Technical designs - block modification
  if (isTechnicalDesign(filePath)) {
    outputHookResponse(
      denyToolUse(
        "Cannot modify technical design directly. Delegate to product-manager agent for spec changes.",
      ),
    );
    return;
  }

  // 3. Ticket files - allow with warning about acceptance criteria
  if (isTicketFile(filePath)) {
    outputHookResponse(
      allowToolUse(
        "Warning: If modifying acceptance criteria, delegate to product-manager agent instead.",
      ),
    );
    return;
  }

  // 4. Shared interface files - allow with warning
  if (isSharedInterfaceFile(filePath)) {
    outputHookResponse(
      allowToolUse(
        "Warning: You are editing a shared interface/types file. If this changes the contract defined in technical design, delegate to product-manager agent first.",
      ),
    );
    return;
  }

  // Allow all other file operations
  outputHookResponse(allowToolUse());
}

main();
