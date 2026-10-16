/**
 * @fileoverview Rule to disallow positional parameters that callers can swap or misread
 */
import { defineRule, type ESTree } from "@oxlint/plugins";

type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function;

/** Conventional names for symmetric operations (equality, comparators), where order is explicit. */
const SYMMETRIC_PAIRS: ReadonlySet<string> = new Set(["a,b", "left,right", "lhs,rhs", "x,y"]);

interface PositionalParameter {
  isBoolean: boolean;
  name: string;
  type: string | undefined;
}

const rule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow two or more positional parameters where two share a type or one is a boolean, which callers can swap or misread",
      url: "https://github.com/ClipboardHealth/core-utils/tree/main/packages/oxlint-plugin/src/lib/rules/no-ambiguous-positional-parameters",
    },
    schema: [],
    messages: {
      booleanParameter:
        "Positional boolean `{{name}}` is unreadable at call sites. Take a single object argument instead.",
      interchangeableParameters:
        "`{{first}}` and `{{second}}` share type `{{type}}`, so callers can swap them without a type error. Take a single object argument instead.",
    },
  },
  create(context) {
    function check(node: FunctionNode): void {
      if (!isAuthorChosenSignature({ node })) {
        return;
      }

      const parameters = node.params.filter(
        (parameter: ESTree.ParamPattern) =>
          !(parameter.type === "Identifier" && parameter.name === "this"),
      );
      const first = parameters[0];
      const last = parameters.at(-1);
      if (parameters.length < 2 || first === undefined || last === undefined) {
        return;
      }

      const positional = parameters.map((parameter: ESTree.ParamPattern) =>
        describeParameter({
          parameter,
          getText: (typeNode) => context.sourceCode.getText(typeNode),
        }),
      );
      // Report on the parameter list, not the function, so changed-line filters flag a new or
      // edited signature without flagging every edit inside a legacy function body.
      const loc = { start: first.loc.start, end: last.loc.end };

      const booleanParameter = positional.find((parameter) => parameter.isBoolean);
      if (booleanParameter) {
        context.report({
          loc,
          messageId: "booleanParameter",
          data: { name: booleanParameter.name },
        });
        return;
      }

      const pair = findInterchangeablePair({ parameters: positional });
      if (pair) {
        context.report({ loc, messageId: "interchangeableParameters", data: pair });
      }
    }

    return {
      ArrowFunctionExpression: check,
      FunctionDeclaration: check,
      FunctionExpression: check,
    };
  },
});

export default rule;

/**
 * Callbacks, typed function values, constructors, overrides, and accessors take the signature their
 * caller or contract dictates, so only functions whose signature the author chooses are checked.
 */
function isAuthorChosenSignature(params: { node: FunctionNode }): boolean {
  const { node } = params;
  if (node.type === "FunctionDeclaration") {
    return true;
  }

  const { parent } = node;
  if (parent?.type === "VariableDeclarator") {
    return parent.init === node && parent.id.type === "Identifier" && !parent.id.typeAnnotation;
  }

  if (parent?.type === "MethodDefinition") {
    return parent.kind === "method" && !parent.override;
  }

  if (parent?.type === "PropertyDefinition") {
    return parent.value === node && !parent.override && !parent.typeAnnotation;
  }

  return false;
}

function describeParameter(params: {
  getText: (node: ESTree.Node) => string;
  parameter: ESTree.ParamPattern;
}): PositionalParameter {
  const { getText, parameter } = params;
  const target = parameter.type === "AssignmentPattern" ? parameter.left : parameter;
  const name = target.type === "Identifier" ? target.name : getText(target);
  const annotation = "typeAnnotation" in target ? target.typeAnnotation?.typeAnnotation : undefined;

  // Destructured and rest parameters are named at the call site's object or spread, so they are
  // never interchangeable with a sibling.
  if (target.type !== "Identifier") {
    return { isBoolean: false, name, type: undefined };
  }

  const type = annotation === undefined ? undefined : normalizeType({ text: getText(annotation) });
  const hasBooleanDefault =
    parameter.type === "AssignmentPattern" &&
    parameter.right.type === "Literal" &&
    typeof parameter.right.value === "boolean";

  return {
    isBoolean: type === "boolean" || (type === undefined && hasBooleanDefault),
    name,
    type,
  };
}

/** Drops whitespace and nullish union members so `x?: string` and `y: string | undefined` match. */
function normalizeType(params: { text: string }): string {
  const members = params.text
    .replaceAll(/\s+/g, "")
    .split("|")
    .filter((member) => member !== "" && member !== "undefined" && member !== "null")
    .map((member) => (member === "true" || member === "false" ? "boolean" : member));

  return [...new Set(members)].toSorted().join("|");
}

function findInterchangeablePair(params: {
  parameters: readonly PositionalParameter[];
}): { first: string; second: string; type: string } | undefined {
  const seen = new Map<string, string>();
  for (const { name, type } of params.parameters) {
    if (type === undefined || type === "") {
      continue;
    }

    const earlier = seen.get(type);
    if (earlier !== undefined && !SYMMETRIC_PAIRS.has(`${earlier},${name}`)) {
      return { first: earlier, second: name, type };
    }

    seen.set(type, name);
  }

  return undefined;
}
