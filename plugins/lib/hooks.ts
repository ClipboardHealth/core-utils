/**
 * Shared types for Claude Code plugin hooks.
 * Uses only Node.js native functions (zero external dependencies at runtime).
 *
 * Exit code semantics:
 * - 0: Success - JSON in stdout is parsed for structured control
 * - 2: Blocking error - only stderr text is used, stdout JSON is ignored
 * - Other: Non-blocking warning - stderr shown to user
 */

/**
 * Permission decision for PreToolUse hooks.
 * - "allow": Permit the tool call to proceed
 * - "deny": Block the tool call with a reason
 */
export type PermissionDecision = "allow" | "deny";

/**
 * Hook-specific output for SessionStart event.
 * Adds context to the session that Claude can use.
 */
export interface SessionStartOutput {
  hookEventName: "SessionStart";
  additionalContext: string;
}

/**
 * Hook-specific output for PreToolUse event.
 * Controls whether a tool call is allowed or denied.
 */
export interface PreToolUseOutput {
  hookEventName: "PreToolUse";
  /**
   * Decision to allow or deny the tool call.
   * If not specified, defaults to allow.
   */
  permissionDecision?: PermissionDecision;
  /**
   * Reason for the permission decision.
   * Shown to Claude when denying to explain why and suggest alternatives.
   */
  permissionDecisionReason?: string;
  /**
   * System message added to context without blocking.
   * Use for warnings or guidance that don't require blocking the operation.
   */
  systemMessage?: string;
}

/**
 * Union of all hook-specific output types.
 */
export type HookSpecificOutput = PreToolUseOutput | SessionStartOutput;

/**
 * Standard hook output structure.
 * Output this as JSON to stdout with exit code 0.
 */
export interface HookOutput {
  hookSpecificOutput: HookSpecificOutput;
}

/**
 * Outputs a hook response to stdout.
 * Must be called with exit code 0 for JSON to be processed.
 */
export function outputHookResponse(output: HookOutput): void {
  console.log(JSON.stringify(output));
}

/**
 * Creates a SessionStart context response.
 */
export function addSessionContext(context: string): HookOutput {
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: context,
    },
  };
}
