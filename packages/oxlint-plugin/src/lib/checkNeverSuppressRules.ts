import { randomBytes } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { runOxlint } from "./internal/runOxlint";
import { NEVER_SUPPRESS_RULES, SUPPRESSION_POLICY_RULE_NAME } from "./internal/suppressionPolicy";

/**
 * For a repository's `checkOxlintConfig` test: lints a probe file that suppresses each
 * never-suppress rule and returns the rules the repository's configuration let through. An empty
 * list means `suppression-policy` is enabled for `directory` and still forbids every rule on the
 * shared list.
 *
 * @example
 * assert.deepEqual(checkNeverSuppressRules({ cwd: REPOSITORY_ROOT, directory: "src" }).unenforcedRules, []);
 */
export function checkNeverSuppressRules(params: {
  /** Repository root; its Oxlint and configuration are used. */
  cwd: string;
  /** Directory, relative to `cwd`, where the probe file is written so its overrides apply.
   * Only a `.ts` file directly in this directory is probed. */
  directory: string;
}): { unenforcedRules: string[] } {
  const { cwd, directory } = params;
  // A direct child of `directory`, so single-level `files` patterns such as `src/*.ts` match it.
  const probeFile = path.join(
    cwd,
    directory,
    `suppression-policy-probe-${randomBytes(6).toString("hex")}.ts`,
  );
  const ruleLines = new Map(NEVER_SUPPRESS_RULES.map((rule, index) => [index * 2 + 1, rule]));
  writeFileSync(
    probeFile,
    NEVER_SUPPRESS_RULES.map(
      (rule, index) =>
        `// oxlint-disable-next-line ${rule} -- Probe for the suppression policy configuration.\nexport const probe${index} = ${index};\n`,
    ).join(""),
  );

  try {
    const { diagnostics } = runOxlint({
      args: ["--format=json", path.relative(cwd, probeFile)],
      cwd,
    });
    const enforced = new Set(
      diagnostics
        .filter(
          (diagnostic) =>
            diagnostic.code.endsWith(`(${SUPPRESSION_POLICY_RULE_NAME})`) &&
            diagnostic.message.includes("must not be suppressed"),
        )
        .map((diagnostic) => ruleLines.get(diagnostic.span?.line ?? 0)),
    );

    return { unenforcedRules: NEVER_SUPPRESS_RULES.filter((rule) => !enforced.has(rule)) };
  } finally {
    rmSync(probeFile, { force: true });
  }
}
