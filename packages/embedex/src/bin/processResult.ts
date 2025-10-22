import { relative as nodeRelative } from "node:path";

import colors from "yoctocolors-cjs";

import { type Embed, type EmbedResult } from "../lib/types";

interface Output {
  code: Embed["code"];
  isError: boolean;
  message: string;
}

export function dim(...messages: string[]) {
  return colors.dim(messages.join(" "));
}

export function processResult(params: {
  check: boolean;
  result: EmbedResult;
  cwd: string;
  verbose: boolean;
}): Output[] {
  const { check, result, cwd, verbose } = params;
  const { embeds, sources, destinations } = result;

  function relative(path: string) {
    return nodeRelative(cwd, path);
  }

  function format(item: { path: string } & ({ destinations: string[] } | { sources: string[] })) {
    const items = "destinations" in item ? item.destinations : item.sources;
    return `${relative(item.path)} -> ${items.map((item) => relative(item)).join(", ")}`;
  }

  if (verbose) {
    console.log(dim("sources:\n  ", sources.map(format).join("\n  ")));
    console.log(dim("destinations:\n  ", destinations.map(format).join("\n  ")));
  }

  const output: Output[] = [];
  for (const embed of embeds) {
    const { code, paths } = embed;
    const { destination, sources } = paths;

    if (code === "INVALID_SOURCE") {
      const { invalidSources } = embed;
      const joined = invalidSources.map((path) => relative(path)).join(", ");
      const missingMessage = `missing: ${joined}`;
      output.push({
        code,
        isError: true,
        message: `${colors.red(code)} ${colors.gray(relative(destination))} -> ${colors.gray(missingMessage)}`,
      });
    } else if (code === "UNREFERENCED_SOURCE") {
      const { unreferencedSources } = embed;
      const joined = unreferencedSources.map((path) => relative(path)).join(", ");
      const notReferencedMessage = `not referenced: ${joined}`;
      output.push({
        code,
        isError: true,
        message: `${colors.red(code)} ${colors.gray(relative(destination))} -> ${colors.gray(notReferencedMessage)}`,
      });
    } else {
      const toOutput = createToOutput({
        code,
        paths: {
          destination: relative(destination),
          sources: sources.map((path) => relative(path)),
        },
      });

      const isError = code === "NO_MATCH" || (code === "UPDATE" && check);
      output.push(toOutput({ isError }));
    }
  }

  return output.sort((a, b) => a.code.localeCompare(b.code));
}

function createToOutput(params: { code: Embed["code"]; paths: Embed["paths"] }) {
  const { code, paths } = params;
  const { destination, sources } = paths;

  return ({ isError }: { isError: boolean }) => ({
    code,
    isError,
    message: `${colors.green(code)} ${colors.gray(destination)} -> ${colors.gray(sources.join(", "))}`,
  });
}
