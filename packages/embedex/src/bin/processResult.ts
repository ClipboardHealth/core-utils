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
  const { embeds, examples, targets } = result;

  function relative(path: string) {
    return nodeRelative(cwd, path);
  }

  if (verbose) {
    console.log(
      dim(
        "examples:\n  ",
        examples
          .map(({ path, targets }) => `${relative(path)} -> ${targets.map(relative).join(", ")}`)
          .join("\n  "),
      ),
    );
    console.log(
      dim(
        "targets:\n  ",
        targets
          .map(({ path, examples }) => `${relative(path)} -> ${examples.map(relative).join(", ")}`)
          .join("\n  "),
      ),
    );
  }

  const output: Output[] = [];
  for (const embed of embeds) {
    const { code, paths } = embed;
    const { target, examples } = paths;
    const toOutput = createToOutput({
      code,
      paths: { target: relative(target), examples: examples.map((path) => relative(path)) },
    });

    // eslint-disable-next-line default-case -- ignore so we get @typescript-eslint/switch-exhaustiveness-check
    switch (code) {
      case "NO_CHANGE": {
        output.push(toOutput({ isError: false }));
        break;
      }

      case "NO_MATCH":
      case "UNSUPPORTED": {
        output.push(toOutput({ isError: true }));
        break;
      }

      case "UPDATE": {
        output.push(toOutput({ isError: check }));
        break;
      }
    }
  }

  return output.sort((a, b) => a.code.localeCompare(b.code));
}

function createToOutput(params: { code: Embed["code"]; paths: Embed["paths"] }) {
  const { code, paths } = params;
  const { target, examples } = paths;

  return ({ isError }: { isError: boolean }) => ({
    code,
    isError,
    message: `${colors.green(code)} ${colors.gray(target)} -> ${colors.gray(examples.join(", "))}`,
  });
}
