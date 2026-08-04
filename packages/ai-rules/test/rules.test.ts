import { readFile } from "node:fs/promises";
import path from "node:path";

import { PROFILES } from "../scripts/constants";
import {
  discoverRules,
  generateAgentsIndex,
  generateReadmeRulesSection,
  parseRuleFile,
  resolveRules,
  type RuleMetadata,
} from "../scripts/rules";

const PACKAGE_ROOT = path.join(__dirname, "..");
const RULES_ROOT = path.join(PACKAGE_ROOT, "rules");
const discoveredRules = discoverRules(RULES_ROOT);

function buildRule(overrides: Partial<RuleMetadata> & { id: string }): RuleMetadata {
  const [category = "", name = ""] = overrides.id.split("/");
  return {
    category,
    description: `${name} description`,
    heading: name,
    relativePath: `${overrides.id}.md`,
    ...overrides,
  };
}

describe(parseRuleFile, () => {
  it("parses description from frontmatter and heading from H1", () => {
    const input = [
      "---",
      'description: "Writing ANY TypeScript code"',
      "---",
      "",
      "# TypeScript",
      "",
      "Body",
    ].join("\n");

    const actual = parseRuleFile({ content: input, filePath: "common/typeScript.md" });

    expect(actual).toStrictEqual({
      description: "Writing ANY TypeScript code",
      heading: "TypeScript",
    });
  });

  it("parses unquoted descriptions", () => {
    const input = ["---", "description: Plain text", "---", "", "# Heading"].join("\n");

    const actual = parseRuleFile({ content: input, filePath: "a/b.md" });

    expect(actual.description).toBe("Plain text");
  });

  it("throws when frontmatter description is missing", () => {
    const input = "# Heading\n\nBody";

    expect(() => parseRuleFile({ content: input, filePath: "a/b.md" })).toThrow(/a\/b\.md/);
  });

  it.each([">", ">-", "|", "|-", ">2", ">-2", ">2-", "> # note"])(
    "throws for a `%s` block-scalar description rather than reading the indicator as the text",
    (indicator) => {
      const input = [
        "---",
        `description: ${indicator}`,
        "  Text held on a following line, which the single-line pattern cannot see.",
        "---",
        "",
        "# Heading",
      ].join("\n");

      expect(() => parseRuleFile({ content: input, filePath: "a/b.md" })).toThrow(/a\/b\.md/);
    },
  );

  it("defaults heading to filename when H1 is missing", () => {
    const input = ["---", "description: Some description", "---", "", "Body without heading"].join(
      "\n",
    );

    const actual = parseRuleFile({ content: input, filePath: "common/myRule.md" });

    expect(actual.heading).toBe("myRule");
  });
});

describe(discoverRules, () => {
  it("discovers all rule categories from directories", async () => {
    const actual = await discoveredRules;

    const uniqueCategories = [...new Set(actual.map((rule) => rule.category))];
    const categories = uniqueCategories.toSorted();
    expect(categories).toStrictEqual([
      "backend",
      "common",
      "commonTs",
      "datamodeling",
      "frontend",
      "infrastructure",
    ]);
  });

  it("returns every rule with a non-empty single-line description", async () => {
    const actual = await discoveredRules;

    expect(actual.length).toBeGreaterThan(0);
    for (const rule of actual) {
      expect(rule.description).toMatch(/\S/);
      expect(rule.description).not.toContain("\n");
    }
  });

  it("includes known rules with expected metadata", async () => {
    const actual = await discoveredRules;

    const typeScript = actual.find((rule) => rule.id === "commonTs/typeScript");
    expect(typeScript).toMatchObject({
      category: "commonTs",
      heading: "TypeScript",
      relativePath: path.join("commonTs", "typeScript.md"),
    });
  });
});

describe(resolveRules, () => {
  const rules = [
    buildRule({ id: "common/a" }),
    buildRule({ id: "common/b" }),
    buildRule({ id: "backend/c" }),
  ];

  it("expands profile categories in order", () => {
    const actual = resolveRules({
      rules,
      profileCategories: ["common"],
      includes: [],
      excludes: [],
    });

    expect(actual.unknownIds).toStrictEqual([]);
    expect(actual.rules.map((rule) => rule.id)).toStrictEqual(["common/a", "common/b"]);
  });

  it("adds includes and removes excludes", () => {
    const actual = resolveRules({
      rules,
      profileCategories: ["common"],
      includes: ["backend/c"],
      excludes: ["common/a"],
    });

    expect(actual.unknownIds).toStrictEqual([]);
    expect(actual.rules.map((rule) => rule.id)).toStrictEqual(["common/b", "backend/c"]);
  });

  it("reports unknown rule ids instead of failing", () => {
    const actual = resolveRules({
      rules,
      profileCategories: ["common"],
      includes: ["nope/missing"],
      excludes: ["also/missing"],
    });

    expect(actual.rules.map((rule) => rule.id)).toStrictEqual(["common/a", "common/b"]);
    expect(actual.unknownIds).toStrictEqual(["nope/missing", "also/missing"]);
  });
});

describe(generateAgentsIndex, () => {
  it("renders one table row per rule with path and description", () => {
    const rules = [buildRule({ id: "common/a", heading: "A", description: "When doing A" })];

    const actual = generateAgentsIndex(rules);

    expect(actual).toContain(
      "Read the rule files relevant to the code you're changing or reviewing.",
    );
    expect(actual).not.toContain("IMPORTANT: You MUST read");
    expect(actual).not.toContain("## Agent Skills");
    expect(actual).toContain("| A | .rules/common/a.md | When doing A |");
  });
});

// Formatters realign table padding and escape characters like `*`, so compare normalized.
function normalizeMarkdown(markdown: string): string {
  return markdown
    .replaceAll("\\", "")
    .replaceAll(/-{3,}/g, "---")
    .replaceAll(/ {2,}/g, " ")
    .replaceAll(" |", "|")
    .trim();
}

describe("README", () => {
  it("contains the generated Available Rules section (run scripts/populateReadme.ts to fix)", async () => {
    const rules = await discoveredRules;
    const readme = await readFile(path.join(PACKAGE_ROOT, "README.md"), "utf8");

    expect(normalizeMarkdown(readme)).toContain(
      normalizeMarkdown(generateReadmeRulesSection(rules)),
    );
  });
});

describe("profiles", () => {
  async function resolveProfile(profile: keyof typeof PROFILES): Promise<string[]> {
    const rules = await discoveredRules;
    const resolved = resolveRules({
      rules,
      profileCategories: PROFILES[profile].include,
      includes: [],
      excludes: [],
    });

    return resolved.rules.map((rule) => rule.id).toSorted();
  }

  it("references only categories that exist on disk", async () => {
    const rules = await discoveredRules;
    const categories = new Set(rules.map((rule) => rule.category));

    const profileCategories = Object.values(PROFILES).flatMap((profile) => profile.include);
    const missing = profileCategories.filter((category) => !categories.has(category));
    expect(missing).toStrictEqual([]);
  });

  it("offers an infrastructure profile for repositories with no application code", async () => {
    const actual = await resolveProfile("infrastructure");

    expect(actual).toStrictEqual([
      "common/configuration",
      "common/gitWorkflow",
      "common/loggingObservability",
      "common/testing",
      "infrastructure/infrastructure",
    ]);
  });

  it("keeps TypeScript-specific guidance out of the infrastructure profile", async () => {
    const actual = await resolveProfile("infrastructure");

    expect(actual).not.toContain("commonTs/typeScript");
    expect(actual).not.toContain("commonTs/errorHandling");
    expect(actual).not.toContain("commonTs/libraryAuthoring");
    expect(actual).not.toContain("commonTs/rulesEngine");
  });

  it("reaches infrastructure guidance without opting into a service profile", async () => {
    const actual = await resolveProfile("infrastructure");

    expect(actual).toContain("infrastructure/infrastructure");
    expect(actual.filter((id) => id.startsWith("backend/"))).toStrictEqual([]);
  });

  it.each(["common", "frontend", "backend", "fullstack"] as const)(
    "keeps TypeScript guidance in the %s profile",
    async (profile) => {
      const actual = await resolveProfile(profile);

      expect(actual).toContain("commonTs/typeScript");
      expect(actual).toContain("common/gitWorkflow");
    },
  );

  it("keeps infrastructure guidance in the backend and fullstack profiles", async () => {
    expect(await resolveProfile("backend")).toContain("infrastructure/infrastructure");
    expect(await resolveProfile("fullstack")).toContain("infrastructure/infrastructure");
  });
});
