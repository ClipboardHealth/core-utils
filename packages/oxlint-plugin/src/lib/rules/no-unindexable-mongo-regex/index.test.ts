import path from "node:path";

import { RuleTester } from "oxlint/plugins-dev";

import rule from "./index";

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
      name: "variable never used in a filter",
      code: "const matcher = /abc/i; if (matcher.test(value)) { await User.find({ email }); }",
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
      name: "case-insensitive anchored regex built from input and returned (INC shape)",
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
