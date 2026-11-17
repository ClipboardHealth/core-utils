import { parseArgs } from "node:util";

import { checkRemovedEnvVars, type RemovedVariable } from "../lib/checkRemovedEnvVars";

const USAGE =
  "Usage: removed-env-vars --base <git-revision> [--templates <directory>]... " +
  "[--exceptions <file>] [--scope <package-scope>]...";
const DEFAULT_TEMPLATES = "terraform/templates";
const DEFAULT_EXCEPTIONS = ".github/removed-env-vars-exceptions.json";
const DEFAULT_SCOPE = "@clipboard-health";

interface RunCliParams {
  arguments_: readonly string[];
  cwd: string;
  isGitHubActions: boolean;
  today: string;
  write: (output: string) => void;
}

/** Returns 0 when the check passes, 1 when it fails and 2 on a usage error. */
export function runCli(params: RunCliParams): number {
  const { arguments_, cwd, isGitHubActions, today, write } = params;
  const { values } = parseArgs({
    args: [...arguments_],
    options: {
      base: { type: "string" },
      templates: { type: "string", multiple: true },
      exceptions: { type: "string" },
      scope: { type: "string", multiple: true },
      help: { type: "boolean" },
    },
    strict: true,
  });

  if (values.help === true) {
    write(`${USAGE}\n`);
    return 0;
  }

  if (values.base === undefined || values.base === "") {
    write(`${USAGE}\n`);
    return 2;
  }

  const exceptionsPath = values.exceptions ?? DEFAULT_EXCEPTIONS;
  const result = checkRemovedEnvVars({
    cwd,
    baseRef: values.base,
    templateDirectories: values.templates ?? [DEFAULT_TEMPLATES],
    exceptionsPath,
    packageScopes: values.scope ?? [DEFAULT_SCOPE],
    today,
  });

  for (const variable of result.removed) {
    write(`${describeRemoval(variable)}\n`);
  }

  for (const exception of result.unusedExceptions) {
    write(
      `Warning: the exception for ${exception.name} in ${exceptionsPath} matches no removed variable; delete it.\n`,
    );
  }

  for (const error of result.errors) {
    write(`${annotate({ isGitHubActions, message: error })}\n`);
  }

  for (const variable of result.violations) {
    const message =
      `${variable.name} is no longer set by ${variable.templates.join(", ")}, but code still reads it:\n` +
      variable.readers
        .map((reader) => `  ${reader.filePath}:${reader.line}  ${reader.text}`)
        .join("\n");
    write(`${annotate({ file: variable.templates[0], isGitHubActions, message })}\n`);
  }

  if (result.violations.length > 0) {
    write(
      `\nEach removed variable above is still read, so the deployed service would run without it.\n` +
        `Fix: keep setting it, or change every reader in the same pull request.\n` +
        `If the readers are unreachable or have a safe fallback, add an exception to ${exceptionsPath}:\n` +
        `  [{ "name": "<VARIABLE>", "reason": "<one line on why it's safe>", "ticket": "<TICKET-123>", "expiresOn": "YYYY-MM-DD" }]\n`,
    );
  }

  return result.errors.length > 0 || result.violations.length > 0 ? 1 : 0;
}

function describeRemoval(variable: RemovedVariable): string {
  const prefix = `Removed ${variable.name} (was in ${variable.templates.join(", ")})`;
  if (variable.readers.length === 0) {
    return `${prefix}: no readers found.`;
  }

  if (variable.exception === undefined) {
    return `${prefix}: still read.`;
  }

  const { reason, ticket, expiresOn } = variable.exception;
  return `${prefix}: still read; exception ${ticket} until ${expiresOn}: ${reason}`;
}

/** GitHub turns `::error` lines into annotations; `%0A` keeps multi-line messages together. */
function annotate(params: {
  file?: string | undefined;
  isGitHubActions: boolean;
  message: string;
}): string {
  const { file, isGitHubActions, message } = params;
  if (!isGitHubActions) {
    return `Error: ${message}`;
  }

  const location = file === undefined ? "" : ` file=${file}`;
  return `::error${location}::${message.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A")}`;
}
