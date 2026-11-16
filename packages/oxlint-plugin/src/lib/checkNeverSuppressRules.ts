import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  /** Directory, relative to `cwd`, where the probe file is written so its overrides apply. */
  directory: string;
}): { unenforcedRules: string[] } {
  const { cwd, directory } = params;
  const probeDirectory = mkdtempSync(path.join(cwd, directory, "suppression-policy-probe-"));
  const probeFile = path.join(probeDirectory, "probe.ts");
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
            diagnostic.code?.endsWith(`(${SUPPRESSION_POLICY_RULE_NAME})`) === true &&
            diagnostic.message.includes("must not be suppressed"),
        )
        .map((diagnostic) => ruleLines.get(diagnostic.labels?.[0]?.span.line ?? 0)),
    );

    return { unenforcedRules: NEVER_SUPPRESS_RULES.filter((rule) => !enforced.has(rule)) };
  } finally {
    rmSync(probeDirectory, { force: true, recursive: true });
  }
}
