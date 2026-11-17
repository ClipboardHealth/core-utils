import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

import { RuleTester } from "oxlint/plugins-dev";

import rule from "./index";

const WORKSPACE_ROOT = path.resolve(__dirname, "../../../../../..");
const PLUGIN = path.join(WORKSPACE_ROOT, "dist/packages/oxlint-plugin/src/index.js");
const OXLINT_CLI = path.join(
  path.dirname(createRequire(__filename).resolve("oxlint/package.json")),
  "bin/oxlint",
);

RuleTester.describe = (name, run) => {
  describe(name, () => {
    run();
  });
};
RuleTester.it = it;

const ruleTester = new RuleTester({
  eslintCompat: true,
  languageOptions: {
    parserOptions: { lang: "ts" },
    sourceType: "module",
  },
});

const cwd = path.join(path.sep, "repo");
const filename = path.join(cwd, "src/users/user.repository.ts");

ruleTester.run("no-unindexable-mongo-regex", rule, {
  valid: [
    {
      name: "exact match",
      code: "await User.findOne({ email: normalizedEmail });",
    },
    {
      name: "anchored literal prefix",
      code: "await User.find({ phone: /^555/ });",
    },
    {
      name: "anchored escaped runtime prefix",
      code: `await User.find({ email: { $regex: \`^\${escapeRegExp(prefix)}\` } });`,
    },
    {
      name: "anchored escaped literal character",
      code: String.raw`await Link.find({ url: { $regex: "^\\.well-known" } });`,
    },
    {
      name: "runtime pattern with unknown anchoring",
      code: "await Log.find({ text: { $regex: pattern } });",
    },
    {
      name: "case-insensitive regex outside any query",
      code: "const isMatch = /^yes$/i.test(answer);",
    },
    {
      name: "static case-insensitive RegExp outside any query",
      code: 'const RETRY = new RegExp("timeout", "i");',
    },
    {
      name: "regex passed to a non-query call",
      code: "schema.string().regex(/[a-z]+/i);",
    },
    {
      name: "object with a regex passed to a non-query helper",
      code: "routes.register({ path: /users/i });",
    },
    {
      name: "regex variable passed to String.prototype.match",
      code: "const pattern = /abc/i; const found = value.match(pattern);",
    },
    {
      name: "variable never used in a filter",
      code: "const matcher = /abc/i; if (matcher.test(value)) { await User.find({ email }); }",
    },
    {
      name: "case-insensitive RegExp from a runtime value used in memory",
      code: 'const cleaned = text.replace(new RegExp(escapeRegExp(word), "gi"), "");',
    },
    {
      name: "file within its known-violations count",
      cwd,
      filename,
      options: [{ knownViolations: { "src/users/user.repository.ts": 1 } }],
      code: 'await User.find({ name: { $regex: search, $options: "i" } });',
    },
  ],
  invalid: [
    {
      name: "case-insensitive anchored regex built from input and returned for use elsewhere",
      code: `export function contactFilter(value: string): RegExp {
        return new RegExp(\`^\\\\s*\${escapeRegExp(value)}\\\\s*$\`, "i");
      }`,
      errors: [{ messageId: "dynamicCaseInsensitive" }],
    },
    {
      name: "$regex with case-insensitive $options",
      code: 'await User.find({ name: { $regex: escapeRegExp(search), $options: "i" } });',
      errors: [{ messageId: "caseInsensitive" }],
    },
    {
      name: "$regex with a case-insensitive RegExp is reported once",
      code: 'await User.find({ name: { $regex: new RegExp(escapeRegExp(search), "i") } });',
      errors: [{ messageId: "caseInsensitive" }],
    },
    {
      name: "case-insensitive regex literal as a field value",
      code: "await User.findOne({ email: /^jane@example\\.com$/i });",
      errors: [{ messageId: "caseInsensitive" }],
    },
    {
      name: "unanchored $regex suffix match",
      code: `await Shift.find({ note: { $regex: \`\${escapeRegExp(marker)}$\` } });`,
      errors: [{ messageId: "unanchored" }],
    },
    {
      name: "unanchored literal regex",
      code: "await Shift.countDocuments({ note: /cancelled/ });",
      errors: [{ messageId: "unanchored" }],
    },
    {
      name: "alternation leaves a branch unanchored",
      code: "await Shift.find({ note: /^a|b/ });",
      errors: [{ messageId: "unanchored" }],
    },
    {
      name: "optional whitespace after the anchor",
      code: `await User.findOne({ email: { $regex: \`^\\\\s*\${escapeRegExp(email)}\` } });`,
      errors: [{ messageId: "noLiteralPrefix" }],
    },
    {
      name: "character class after the anchor",
      code: "await User.find({ phone: /^[\\s().-]*555/ });",
      errors: [{ messageId: "noLiteralPrefix" }],
    },
    {
      name: "optional first character",
      code: "await User.find({ phone: /^1?555/ });",
      errors: [{ messageId: "noLiteralPrefix" }],
    },
    {
      name: "regex in $in under a query method",
      code: `await Profile.find({ qualification: { $in: names.map((name) => new RegExp(\`^\${escapeRegExp(name)}$\`, "i")) } });`,
      errors: [{ messageId: "caseInsensitive" }],
    },
    {
      name: "regex in an $or branch of an aggregate $match",
      code: "await User.aggregate([{ $match: { $or: [{ name: /smith/ }] } }]);",
      errors: [{ messageId: "unanchored" }],
    },
    {
      name: "regex variable used as a computed field value",
      code: `const filter = new RegExp(\`^\${escapeRegExp(value)}$\`, "i");
        await db.collection("users").findOne({ [field]: filter });`,
      errors: [{ messageId: "caseInsensitive" }],
    },
    {
      name: "filter object declared with a filter type",
      code: "const query: FilterQuery<User> = { email: /example/ }; await User.find(query);",
      errors: [{ messageId: "unanchored" }],
    },
    {
      name: "filter object held in an untyped variable",
      code: "const query = { name: /smith/i }; await User.find(query);",
      errors: [{ messageId: "caseInsensitive" }],
    },
    {
      name: "aggregate builder match stage",
      code: "await User.aggregate().match({ email: /example/ });",
      errors: [{ messageId: "unanchored" }],
    },
    {
      name: "multiline flag lets ^ match after any newline",
      code: "await User.find({ name: /^smith/m });",
      errors: [{ messageId: "unanchored" }],
    },
    {
      name: "alphanumeric escape after the anchor",
      code: "await User.find({ name: /^\\tsmith/ });",
      errors: [{ messageId: "noLiteralPrefix" }],
    },
    {
      name: "concatenated pattern with optional whitespace after the anchor",
      code: 'await User.find({ email: { $regex: "^\\\\s*" + escapeRegExp(email) } });',
      errors: [{ messageId: "noLiteralPrefix" }],
    },
    {
      name: "inline exception in a file at its known-violations count",
      cwd,
      filename,
      options: [{ knownViolations: { "src/users/user.repository.ts": 1 } }],
      code: `await User.find({ name: { $regex: search, $options: "i" } });
        // oxlint-disable-next-line @clipboard-health/no-unindexable-mongo-regex -- Admin search over a small collection
        await Tag.find({ name: { $regex: search, $options: "i" } });`,
      // The directive suppresses this report in oxlint; RuleTester does not apply directives.
      errors: [{ messageId: "caseInsensitive", line: 3 }],
    },
    {
      name: "file over its known-violations count",
      cwd,
      filename,
      options: [{ knownViolations: { "src/users/user.repository.ts": 1 } }],
      code: `await User.find({ name: { $regex: search, $options: "i" } });
        await User.find({ email: { $regex: search, $options: "i" } });`,
      errors: [{ messageId: "caseInsensitive" }, { messageId: "caseInsensitive" }],
    },
    {
      name: "file below its known-violations count",
      cwd,
      filename,
      options: [{ knownViolations: { "src/users/user.repository.ts": 2 } }],
      code: 'await User.find({ name: { $regex: search, $options: "i" } });',
      errors: [{ messageId: "staleBaseline" }],
    },
  ],
});

describe("no-unindexable-mongo-regex inline exceptions in oxlint", () => {
  it("uses the disable directive instead of reporting it as unused", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "no-unindexable-mongo-regex-"));
    try {
      writeFileSync(
        path.join(directory, ".oxlintrc.json"),
        JSON.stringify({
          jsPlugins: [{ name: "@clipboard-health", specifier: PLUGIN }],
          rules: { "@clipboard-health/no-unindexable-mongo-regex": "error" },
        }),
      );
      writeFileSync(
        path.join(directory, "repository.ts"),
        `// oxlint-disable-next-line @clipboard-health/no-unindexable-mongo-regex -- Admin search over a small collection
await Tag.find({ name: { $regex: search, $options: "i" } });
`,
      );

      const result = spawnSync(
        process.execPath,
        [OXLINT_CLI, "--report-unused-disable-directives-severity", "error", "repository.ts"],
        { cwd: directory, encoding: "utf8" },
      );

      expect({ status: result.status, stdout: result.stdout }).toMatchObject({ status: 0 });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
