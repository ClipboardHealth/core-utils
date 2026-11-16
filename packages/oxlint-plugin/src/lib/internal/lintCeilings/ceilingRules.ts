/**
 * A rule with a numeric `max` that lint-ceilings.json can raise per file. `file` rules report one
 * count per file; `node` rules report one per function or block, so a file's value is its largest.
 */
export interface CeilingRule {
  /** Other keys Oxlint accepts for the rule in a configuration. */
  aliases: readonly string[];
  /** Category that enables the rule when the configuration does not name it. */
  category: "pedantic" | "restriction" | "style";
  /** Diagnostic code in Oxlint's JSON output. */
  code: string;
  /** Plugin that must be enabled for the category to turn the rule on; `eslint` is always on. */
  plugin: "eslint" | "import";
  scope: "file" | "node";
}

export const CEILING_RULES: Readonly<Record<string, CeilingRule>> = {
  complexity: rule({ category: "restriction", name: "complexity", scope: "node" }),
  "import/max-dependencies": {
    aliases: ["max-dependencies"],
    category: "pedantic",
    code: "import(max-dependencies)",
    plugin: "import",
    scope: "file",
  },
  "max-depth": rule({ category: "pedantic", name: "max-depth", scope: "node" }),
  "max-lines": rule({ category: "pedantic", name: "max-lines", scope: "file" }),
  "max-lines-per-function": rule({
    category: "pedantic",
    name: "max-lines-per-function",
    scope: "node",
  }),
  "max-nested-callbacks": rule({
    category: "pedantic",
    name: "max-nested-callbacks",
    scope: "node",
  }),
  "max-params": rule({ category: "style", name: "max-params", scope: "node" }),
  "max-statements": rule({ category: "style", name: "max-statements", scope: "node" }),
};

export function isCeilingRule(name: string): boolean {
  return Object.hasOwn(CEILING_RULES, name);
}

export function getCeilingRule(name: string): CeilingRule {
  const ceilingRule = CEILING_RULES[name];
  if (ceilingRule === undefined) {
    throw new Error(`${name} is not a lint-ceilings rule.`);
  }

  return ceilingRule;
}

function rule(params: {
  category: CeilingRule["category"];
  name: string;
  scope: CeilingRule["scope"];
}): CeilingRule {
  const { category, name, scope } = params;
  return {
    aliases: [`eslint/${name}`],
    category,
    code: `eslint(${name})`,
    plugin: "eslint",
    scope,
  };
}
