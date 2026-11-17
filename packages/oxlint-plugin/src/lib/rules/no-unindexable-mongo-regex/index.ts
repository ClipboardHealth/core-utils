/**
 * @fileoverview Rule to disallow MongoDB filter regexes that no index can bound.
 *
 * MongoDB can turn a regex into tight index bounds only when it is case-sensitive and starts with
 * `^` followed by literal text. A case-insensitive regex, an unanchored one, or one whose first
 * atom is a class, group or optional character (`^\s*`, `^[a-z]`, `^a?`) scans every key in the
 * index, or every document without one. The query's cost then grows with the collection, so it
 * passes tests and times out in production.
 *
 * The rule reports a regex in a filter position:
 *
 * - the value of `$regex`, combined with a literal `$options`
 * - a field value or `$in`/`$nin`/`$all`/`$not` element of an object passed to a query method such
 *   as `find` or `updateOne`, nested under `$and`/`$or`/`$nor`/`$match`/`$elemMatch`, or declared
 *   with a `FilterQuery`-like type
 * - a variable holding such a regex, when the variable reaches one of those positions
 *
 * Oxlint JS plugins receive no type information, so a regex built in one function and used in a
 * filter elsewhere is invisible at the filter. The rule therefore also reports `new RegExp(value,
 * "i")` built from a runtime value anywhere in the linted files. Scope the rule to code that talks
 * to MongoDB.
 *
 * A pattern whose start is a runtime value, such as `new RegExp(pattern)`, is not reported unless
 * it is case-insensitive or wrapped in `escapeRegExp`: the rule can't see whether it is anchored.
 *
 * `knownViolations` maps a file path, relative to the working directory, to the number of reports
 * it may have. A file may shrink below its count but not grow past it, and the rule asks for the
 * count to be lowered once the file shrinks.
 */
import path from "node:path";

import { defineRule, type ESTree } from "@oxlint/plugins";

const RULE_URL =
  "https://github.com/ClipboardHealth/core-utils/tree/main/packages/oxlint-plugin/src/lib/rules/no-unindexable-mongo-regex";

/** Query methods, mapped to the position of their filter argument. */
const QUERY_METHODS = new Map([
  ["count", 0],
  ["countDocuments", 0],
  ["deleteMany", 0],
  ["deleteOne", 0],
  ["distinct", 1],
  ["exists", 0],
  ["find", 0],
  ["findOne", 0],
  ["findOneAndDelete", 0],
  ["findOneAndRemove", 0],
  ["findOneAndReplace", 0],
  ["findOneAndUpdate", 0],
  ["match", 0],
  ["replaceOne", 0],
  ["updateMany", 0],
  ["updateOne", 0],
  ["where", 0],
]);

/** Keys that only appear in MongoDB filters, so a regex below one is in a filter. */
const FILTER_OPERATOR_KEYS = new Set([
  "$all",
  "$and",
  "$elemMatch",
  "$in",
  "$match",
  "$nin",
  "$nor",
  "$not",
  "$or",
]);

const FILTER_TYPE_NAMES = new Set(["Filter", "FilterQuery", "QueryFilter", "RootFilterQuery"]);

const ESCAPE_FUNCTIONS = new Set(["escapeRegExp", "escapeRegex", "escapeStringRegexp"]);

const TRANSPARENT_PARENTS = new Set([
  "ArrayExpression",
  "ConditionalExpression",
  "LogicalExpression",
  "ObjectExpression",
  "ParenthesizedExpression",
  "SpreadElement",
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
]);

const IN_MEMORY_STRING_METHODS = new Set([
  "match",
  "matchAll",
  "replace",
  "replaceAll",
  "search",
  "split",
]);

const IN_MEMORY_REGEX_METHODS = new Set(["exec", "test"]);

const DISABLE_DIRECTIVE = /^\s*(?:eslint|oxlint)-disable-(next-)?line\s+([^\n]*?)(?:\s+--.*)?$/;

const MAX_VARIABLE_DEPTH = 3;

type Problem = "caseInsensitive" | "noLiteralPrefix" | "unanchored";

/** A pattern as static text interleaved with runtime values. */
type Segment = { kind: "text"; text: string } | { kind: "value"; node: ESTree.Node };

interface Report {
  node: ESTree.Node;
  messageId: Problem | "dynamicCaseInsensitive";
}

function propertyKeyName(property: ESTree.Node): string | undefined {
  if (property.type !== "Property") {
    return undefined;
  }

  const { key } = property;
  if (key.type === "Identifier" && !property.computed) {
    return key.name;
  }

  return key.type === "Literal" && typeof key.value === "string" ? key.value : undefined;
}

function calleeName(callee: ESTree.Node): string | undefined {
  if (callee.type === "Identifier") {
    return callee.name;
  }

  if (callee.type === "MemberExpression" && callee.property.type === "Identifier") {
    return callee.property.name;
  }

  return undefined;
}

function isRegExpConstructor(
  node: ESTree.Node,
): node is ESTree.CallExpression | ESTree.NewExpression {
  return (
    (node.type === "NewExpression" || node.type === "CallExpression") &&
    node.callee.type === "Identifier" &&
    node.callee.name === "RegExp"
  );
}

function isRegexLiteral(node: ESTree.Node): node is ESTree.RegExpLiteral {
  return node.type === "Literal" && "regex" in node && node.regex !== undefined;
}

function isEscapeCall(node: ESTree.Node): boolean {
  if (node.type !== "CallExpression") {
    return false;
  }

  const name = calleeName(node.callee);
  return name !== undefined && ESCAPE_FUNCTIONS.has(name);
}

function isMapCallback(parent: ESTree.Node, child: ESTree.Node): boolean {
  const call = parent.parent as ESTree.Node | null | undefined;
  return (
    parent.type === "ArrowFunctionExpression" &&
    parent.expression &&
    parent.body === child &&
    call?.type === "CallExpression" &&
    calleeName(call.callee) === "map"
  );
}

/** A regex passed straight to a string method, or tested on the spot, never reaches a query. */
function isUsedInMemory(node: ESTree.Node): boolean {
  const parent = node.parent as ESTree.Node | null | undefined;
  if (parent?.type === "CallExpression") {
    const name = calleeName(parent.callee);
    return (
      parent.arguments.includes(node as ESTree.Expression) &&
      name !== undefined &&
      IN_MEMORY_STRING_METHODS.has(name)
    );
  }

  return (
    parent?.type === "MemberExpression" &&
    parent.object === node &&
    parent.property.type === "Identifier" &&
    IN_MEMORY_REGEX_METHODS.has(parent.property.name)
  );
}

function hasFilterType(declarator: ESTree.VariableDeclarator): boolean {
  const annotation =
    declarator.id.type === "Identifier" ? declarator.id.typeAnnotation?.typeAnnotation : undefined;
  if (annotation?.type !== "TSTypeReference") {
    return false;
  }

  const { typeName } = annotation;
  const name = typeName.type === "TSQualifiedName" ? typeName.right.name : typeName;
  return typeof name === "string"
    ? FILTER_TYPE_NAMES.has(name)
    : name.type === "Identifier" && FILTER_TYPE_NAMES.has(name.name);
}

function toSegments(node: ESTree.Node | undefined): Segment[] | undefined {
  if (!node) {
    return undefined;
  }

  if (isRegexLiteral(node)) {
    return [{ kind: "text", text: node.regex.pattern }];
  }

  if (node.type === "Literal" && typeof node.value === "string") {
    return [{ kind: "text", text: node.value }];
  }

  if (node.type === "TemplateLiteral") {
    const segments: Segment[] = [];
    for (const [index, quasi] of node.quasis.entries()) {
      segments.push({
        kind: "text",
        text: quasi.value.cooked ?? quasi.value.raw,
      });
      const expression = node.expressions[index];
      if (expression) {
        segments.push({ kind: "value", node: expression });
      }
    }

    return segments;
  }

  if (node.type === "BinaryExpression" && node.operator === "+") {
    const left = toSegments(node.left);
    const right = toSegments(node.right);
    return left && right ? [...left, ...right] : undefined;
  }

  if (isRegExpConstructor(node)) {
    return toSegments(node.arguments[0]);
  }

  return [{ kind: "value", node }];
}

function isStatic(segments: Segment[]): boolean {
  return segments.every((segment) => segment.kind === "text");
}

/** Flags from a regex literal or `RegExp(…)` call; `undefined` when they are a runtime value. */
function regexFlags(node: ESTree.Node): string | undefined {
  if (isRegexLiteral(node)) {
    return node.regex.flags;
  }

  if (isRegExpConstructor(node)) {
    const [pattern, flags] = node.arguments as Array<ESTree.Node | undefined>;
    if (flags === undefined) {
      return pattern && isRegexLiteral(pattern) ? pattern.regex.flags : "";
    }

    return flags.type === "Literal" && typeof flags.value === "string" ? flags.value : undefined;
  }

  return "";
}

/** Whether static pattern text has a top-level `|`, which leaves a branch unanchored. */
function hasTopLevelAlternation(text: string): boolean {
  let depth = 0;
  let inClass = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\\") {
      index += 1;
    } else if (inClass) {
      inClass = char !== "]";
    } else if (char === "[") {
      inClass = true;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    } else if (char === "|" && depth === 0) {
      return true;
    }
  }

  return false;
}

/** Length of the first atom of `text`, or `undefined` when it isn't a literal character. */
function literalAtomLength(text: string): number | undefined {
  const [char, next] = text;
  if (char === "\\") {
    if (next === undefined || /[\dA-Za-z]/.test(next)) {
      return undefined;
    }

    return 2;
  }

  return char === undefined || "$()*+.?[]{|}".includes(char) ? undefined : 1;
}

function prefixProblem(segments: Segment[]): Problem | undefined {
  const parts: Segment[] = [];
  for (const segment of segments) {
    const previous = parts.at(-1);
    if (segment.kind === "text" && previous?.kind === "text") {
      previous.text += segment.text;
    } else if (segment.kind === "value" || segment.text !== "") {
      parts.push(segment.kind === "text" ? { ...segment } : segment);
    }
  }

  const [first, second] = parts;
  if (!first) {
    return "unanchored";
  }

  if (first.kind === "value") {
    return isEscapeCall(first.node) ? "unanchored" : undefined;
  }

  if (!first.text.startsWith("^")) {
    return "unanchored";
  }

  const staticText = parts.map((part) => (part.kind === "text" ? part.text : "")).join("");
  if (hasTopLevelAlternation(staticText)) {
    return "unanchored";
  }

  const rest = first.text.slice(1);
  if (rest === "") {
    // `^${value}`: an escaped value is a literal prefix; anything else is unknown.
    return second ? undefined : "noLiteralPrefix";
  }

  const atomLength = literalAtomLength(rest);
  if (atomLength === undefined) {
    return "noLiteralPrefix";
  }

  const quantifier = rest.slice(atomLength);
  return /^(?:[*?]|\{0[,}])/.test(quantifier) ? "noLiteralPrefix" : undefined;
}

function regexProblem(
  segments: Segment[] | undefined,
  flags: string | undefined,
): Problem | undefined {
  if (flags?.includes("i")) {
    return "caseInsensitive";
  }

  const problem = segments ? prefixProblem(segments) : undefined;
  // With the multiline flag, `^` also matches after a newline, so it no longer bounds the index.
  return problem ?? (flags?.includes("m") && segments ? "unanchored" : undefined);
}

const rule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow MongoDB filter regexes that an index can't bound",
      url: RULE_URL,
    },
    schema: [
      {
        type: "object",
        properties: {
          knownViolations: {
            type: "object",
            additionalProperties: { type: "integer", minimum: 1 },
            description:
              "Per-file report counts, keyed by path relative to the working directory, for violations that predate the rule. A file may shrink but not grow.",
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      caseInsensitive:
        "Case-insensitive regex in a MongoDB filter. No index can bound it, so the query scans every key, or every document, and slows as the collection grows. Store and match a normalized value exactly, or query through a case-insensitive collation index.{{ baseline }}",
      noLiteralPrefix:
        "MongoDB filter regex has no literal text right after `^`, so no index can bound it and the query scans every key. Normalize the stored value and start the pattern with literal text, or match exactly.{{ baseline }}",
      unanchored:
        "MongoDB filter regex isn't anchored with `^` on every branch, so no index can bound it and the query scans every key. Anchor it with `^` and literal text, or match exactly.{{ baseline }}",
      dynamicCaseInsensitive:
        "Case-insensitive RegExp built from a runtime value. If it reaches a MongoDB filter, no index can bound it and the query scans every key. Match a normalized value exactly instead. If this regex never reaches a query, disable this line with a reason.{{ baseline }}",
      staleBaseline:
        "This file now has {{ actual }} unindexable MongoDB regex reports, below its known-violations count of {{ allowed }}. Lower the count to {{ actual }}, or remove the entry at 0.",
    },
  },
  create(context) {
    const [options] = context.options as Array<
      { knownViolations?: Record<string, number> } | undefined
    >;
    const relativePath = path.relative(context.cwd, context.filename).split(path.sep).join("/");
    const allowed = options?.knownViolations?.[relativePath] ?? 0;
    const reports: Report[] = [];
    const reported = new Set<ESTree.Node>();

    function add(node: ESTree.Node, messageId: Report["messageId"]): void {
      if (!reported.has(node)) {
        reported.add(node);
        reports.push({ node, messageId });
      }
    }

    /** `objectAlias`: `start` references a variable initialized with an object literal. */
    function inFilter(start: ESTree.Node, depth: number, objectAlias = false): boolean {
      let child: ESTree.Node = start;
      let parent = child.parent as ESTree.Node | null | undefined;
      while (parent) {
        if (parent.type === "Property") {
          if (parent.value !== child) {
            return false;
          }

          const key = propertyKeyName(parent);
          if (key !== undefined && FILTER_OPERATOR_KEYS.has(key)) {
            return true;
          }
        } else if (parent.type === "CallExpression") {
          const name = calleeName(parent.callee);
          const argument: ESTree.Node = child;
          return (
            (child.type === "ObjectExpression" || (objectAlias && child.type === "Identifier")) &&
            name !== undefined &&
            (parent.arguments as ESTree.Node[]).indexOf(argument) === QUERY_METHODS.get(name)
          );
        } else if (isMapCallback(parent, child)) {
          // `values.map((value) => regex)` builds an array of regexes, such as an `$in` list.
          child = parent.parent!;
          parent = child.parent as ESTree.Node | null | undefined;
          continue;
        } else if (parent.type === "VariableDeclarator") {
          return parent.init === child && declaredInFilter(parent, depth, objectAlias);
        } else if (!TRANSPARENT_PARENTS.has(parent.type)) {
          return false;
        }

        child = parent;
        parent = child.parent as ESTree.Node | null | undefined;
      }

      return false;
    }

    function declaredInFilter(
      declarator: ESTree.VariableDeclarator,
      depth: number,
      objectAlias: boolean,
    ): boolean {
      if (hasFilterType(declarator)) {
        return true;
      }

      if (depth >= MAX_VARIABLE_DEPTH || declarator.id.type !== "Identifier") {
        return false;
      }

      return context.sourceCode.getDeclaredVariables(declarator).some((variable) =>
        variable.references.some(
          (reference) =>
            reference.identifier !== declarator.id &&
            inFilter(
              reference.identifier,
              depth + 1,
              // An alias of an object filter is still an object filter.
              declarator.init?.type === "ObjectExpression" ||
                (declarator.init?.type === "Identifier" && objectAlias),
            ),
        ),
      );
    }

    /** A local, unexported binding whose every use is in memory never reaches a query. */
    function isBoundForInMemoryUseOnly(node: ESTree.Node): boolean {
      const declarator = node.parent as ESTree.Node | null | undefined;
      if (
        declarator?.type !== "VariableDeclarator" ||
        declarator.init !== node ||
        declarator.id.type !== "Identifier" ||
        declarator.parent.parent?.type === "ExportNamedDeclaration"
      ) {
        return false;
      }

      const references = context.sourceCode
        .getDeclaredVariables(declarator)
        .flatMap((variable) => variable.references)
        .filter((reference) => reference.identifier !== declarator.id);
      return (
        references.length > 0 &&
        references.every((reference) => isUsedInMemory(reference.identifier))
      );
    }

    function isRegexOperand(node: ESTree.Node): boolean {
      const { parent } = node as { parent?: ESTree.Node };
      return parent?.type === "Property" && propertyKeyName(parent) === "$regex";
    }

    function checkRegex(node: ESTree.Node): void {
      if (isRegexOperand(node)) {
        return;
      }

      const segments = toSegments(node);
      const flags = regexFlags(node);
      const problem = inFilter(node, 0) ? regexProblem(segments, flags) : undefined;
      if (problem) {
        add(node, problem);
      } else if (
        isRegExpConstructor(node) &&
        flags?.includes("i") &&
        segments !== undefined &&
        !isStatic(segments) &&
        !isUsedInMemory(node) &&
        !isBoundForInMemoryUseOnly(node)
      ) {
        add(node, "dynamicCaseInsensitive");
      }
    }

    return {
      Literal(node) {
        if (isRegexLiteral(node)) {
          checkRegex(node);
        }
      },
      NewExpression(node) {
        if (isRegExpConstructor(node)) {
          checkRegex(node);
        }
      },
      CallExpression(node) {
        if (isRegExpConstructor(node)) {
          checkRegex(node);
        }
      },
      ObjectExpression(node) {
        const regexProperty = node.properties.find(
          (property): property is ESTree.ObjectProperty => propertyKeyName(property) === "$regex",
        );
        if (!regexProperty) {
          return;
        }

        const optionsProperty = node.properties.find(
          (property): property is ESTree.ObjectProperty => propertyKeyName(property) === "$options",
        );
        const optionsValue = optionsProperty?.value;
        const options =
          optionsValue?.type === "Literal" && typeof optionsValue.value === "string"
            ? optionsValue.value
            : "";
        const value = regexProperty.value as ESTree.Node;
        const valueFlags = regexFlags(value);
        const problem = regexProblem(toSegments(value), `${options}${valueFlags ?? ""}`);
        if (problem) {
          add(regexProperty, problem);
        }
      },
      "Program:exit"(node) {
        // An inline exception is outside the count, so adding one doesn't fail baselined lines.
        const disabledLines = new Set<number>();
        for (const comment of context.sourceCode.getAllComments()) {
          const match = DISABLE_DIRECTIVE.exec(comment.value);
          const ruleNames = match?.[2]?.split(",").map((name) => name.trim()) ?? [];
          if (match && ruleNames.some((name) => name.endsWith("/no-unindexable-mongo-regex"))) {
            const line = comment.loc.end.line;
            disabledLines.add(match[1] === undefined ? line : line + 1);
          }
        }

        const excepted = reports.filter((report) => disabledLines.has(report.node.loc.start.line));
        const counted = reports.length - excepted.length;
        const baseline =
          allowed > 0
            ? ` This file's known-violations count is ${allowed}; it now has ${counted}.`
            : "";
        // Excepted reports are always emitted so their disable directives count as used.
        for (const report of counted > allowed ? reports : excepted) {
          context.report({
            node: report.node,
            messageId: report.messageId,
            data: { baseline },
          });
        }

        if (counted < allowed) {
          context.report({
            node,
            messageId: "staleBaseline",
            data: { actual: String(counted), allowed: String(allowed) },
          });
        }
      },
    };
  },
});

export default rule;
