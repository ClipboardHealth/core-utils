/**
 * @fileoverview Require contract-package response schemas before response-shape assertions.
 *
 * Migration playbook:
 * 1. Find the endpoint in its `@clipboard-health/contract-*` package and use the schema for the
 *    asserted status code, commonly `contract.endpoint.responses[status]` or an exported
 *    `XResponseSchema`.
 * 2. Parse before shape assertions with `parseBody(response, schema)` or
 *    `schema.parse(response.parsedBody)`, then assert on the parsed value.
 * 3. If the contract package has no response schema, file a contract-gap ticket and add the schema
 *    there. An inline permissive schema or ESLint exemption is not a contract oracle.
 *
 * Warn-to-error ratchet:
 * Enable the rule as a warning across the migration scope. Migrate one directory at a time and add
 * an error-level override for each completed directory. CI may suppress the warning backlog with
 * `--quiet`, making every error-level directory a blocking ratchet. Once the full scope is migrated,
 * replace the overrides with one error-level setting and restore the zero-warning budget.
 */
import type { ESTree, Rule, Variable } from "@oxlint/plugins";

import { findVariable as findVariableInScope } from "../../internal/findVariable";

const CONTRACT_PACKAGE_PREFIX = "@clipboard-health/contract-";
const ANY_SCHEMA_METHODS = new Set(["any", "unknown"]);
const SCHEMA_PARSE_METHODS = new Set(["parse", "parseAsync"]);
const MATCHER_MODIFIERS = new Set(["not", "rejects", "resolves"]);
const CONTROL_FLOW_TYPES = new Set<ESTree.Node["type"]>([
  "CatchClause",
  "ConditionalExpression",
  "DoWhileStatement",
  "ForInStatement",
  "ForOfStatement",
  "ForStatement",
  "IfStatement",
  "LogicalExpression",
  "SwitchCase",
  "SwitchStatement",
  "TryStatement",
  "WhileStatement",
]);

type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function;
type Identifier = ESTree.BindingIdentifier | ESTree.IdentifierName | ESTree.IdentifierReference;
type ResponseKey = Variable | string;

interface FunctionState {
  parses: Map<ResponseKey, ESTree.Node[]>;
  writes: Map<ResponseKey, ESTree.Node[]>;
}

function unwrap(node: ESTree.Node | undefined): ESTree.Node | undefined {
  let current = node;

  while (
    current?.type === "ChainExpression" ||
    current?.type === "TSAsExpression" ||
    current?.type === "TSInstantiationExpression" ||
    current?.type === "TSNonNullExpression" ||
    current?.type === "TSSatisfiesExpression" ||
    current?.type === "TSTypeAssertion"
  ) {
    current = current.expression;
  }

  return current;
}

function memberPropertyName(node: ESTree.MemberExpression): string | undefined {
  if (!node.computed && node.property.type === "Identifier") {
    return node.property.name;
  }

  if (node.computed && node.property.type === "Literal") {
    return typeof node.property.value === "string" ? node.property.value : undefined;
  }

  return undefined;
}

function containingFunction(node: ESTree.Node): FunctionNode | undefined {
  let current = node.parent;

  while (current) {
    if (
      current.type === "ArrowFunctionExpression" ||
      current.type === "FunctionDeclaration" ||
      current.type === "FunctionExpression"
    ) {
      return current;
    }

    current = current.parent;
  }

  return undefined;
}

function addEvidence(
  collection: Map<ResponseKey, ESTree.Node[]>,
  key: ResponseKey,
  node: ESTree.Node,
): void {
  const nodes = collection.get(key) ?? [];
  nodes.push(node);
  collection.set(key, nodes);
}

function isAncestor(ancestor: ESTree.Node, node: ESTree.Node): boolean {
  let current: ESTree.Node | null | undefined = node;
  while (current) {
    if (current === ancestor) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function directChild(ancestor: ESTree.Node, node: ESTree.Node): ESTree.Node | undefined {
  let current: ESTree.Node | undefined = node;
  while (current?.parent && current.parent !== ancestor) {
    current = current.parent;
  }
  return current?.parent === ancestor ? current : undefined;
}

function objectContainsParsedBodyProperty(node: ESTree.Node | undefined): boolean {
  if (node?.type !== "ObjectExpression") {
    return false;
  }

  return node.properties.some((property) => {
    if (property.type !== "Property") {
      return false;
    }

    const propertyName =
      property.key.type === "Identifier"
        ? property.key.name
        : property.key.type === "Literal"
          ? property.key.value
          : undefined;

    return propertyName === "parsedBody" || objectContainsParsedBodyProperty(property.value);
  });
}

function isParsedBodyPropertyPath(node: ESTree.Node | undefined): boolean {
  if (node?.type === "Literal" && typeof node.value === "string") {
    return /^parsedBody(?:\.|\[|$)/u.test(node.value);
  }

  return (
    node?.type === "ArrayExpression" &&
    node.elements[0]?.type === "Literal" &&
    node.elements[0].value === "parsedBody"
  );
}

const rule: Rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Require response assertions to use contract-package schemas",
      url: "https://github.com/ClipboardHealth/core-utils/tree/main/packages/eslint-plugin/src/lib/rules/require-contract-response-parse",
    },
    schema: [],
    messages: {
      inlineAnySchema:
        "Inline z.{{method}}() schemas are not contract oracles. Use the endpoint response schema from a @clipboard-health/contract-* package.",
      missingContractParse:
        "Parse this response body with its @clipboard-health/contract-* response schema before asserting its shape.",
      nonContractSchema:
        "This schema is not a contract oracle. Use the endpoint response schema from a @clipboard-health/contract-* package.",
    },
  },

  create(context) {
    const contractBindings = new Set<Variable>();
    const zodBindings = new Set<Variable>();
    const functionStates = new Map<FunctionNode, FunctionState>();
    const topLevelState: FunctionState = {
      parses: new Map(),
      writes: new Map(),
    };
    const validatedParsedBodyAccesses = new WeakSet<ESTree.MemberExpression>();

    function rootIdentifier(node: ESTree.Node | undefined): Identifier | undefined {
      let current = unwrap(node);

      while (current?.type === "MemberExpression") {
        current = unwrap(current.object);
      }

      return current?.type === "Identifier" ? current : undefined;
    }

    function parsedBodyAccess(node: ESTree.Node | undefined): ESTree.MemberExpression | undefined {
      let current = unwrap(node);

      while (current?.type === "MemberExpression") {
        if (memberPropertyName(current) === "parsedBody") {
          return current;
        }

        current = unwrap(current.object);
      }

      return undefined;
    }

    function findVariable(node: Identifier): Variable | undefined {
      return findVariableInScope(context.sourceCode, node);
    }

    function responseKey(node: ESTree.Node | undefined): ResponseKey | undefined {
      const current = unwrap(node);

      if (current?.type === "Identifier") {
        return findVariable(current) ?? current.name;
      }

      if (current?.type === "MemberExpression") {
        return context.sourceCode.getText(current);
      }

      return undefined;
    }

    function isContractSchema(node: ESTree.Node | undefined): boolean {
      const identifier = rootIdentifier(node);
      if (!identifier) {
        return false;
      }

      const variable = findVariable(identifier);
      return variable !== undefined && contractBindings.has(variable);
    }

    function stateFor(node: ESTree.Node): FunctionState {
      const functionNode = containingFunction(node);
      if (!functionNode) {
        return topLevelState;
      }

      const existingState = functionStates.get(functionNode);
      if (existingState) {
        return existingState;
      }

      const state: FunctionState = { parses: new Map(), writes: new Map() };
      functionStates.set(functionNode, state);
      return state;
    }

    function parseDominatesAssertion(parseNode: ESTree.Node, assertionNode: ESTree.Node): boolean {
      if (
        containingFunction(parseNode) !== containingFunction(assertionNode) ||
        parseNode.range[0] >= assertionNode.range[0]
      ) {
        return false;
      }

      let current = parseNode.parent;
      const functionNode = containingFunction(parseNode);
      while (current && current !== functionNode) {
        if (
          CONTROL_FLOW_TYPES.has(current.type) &&
          (!isAncestor(current, assertionNode) ||
            directChild(current, parseNode) !== directChild(current, assertionNode))
        ) {
          return false;
        }
        current = current.parent;
      }

      return true;
    }

    function hasContractParse(node: ESTree.Node, key: ResponseKey): boolean {
      const state = stateFor(node);
      const parses = state.parses.get(key) ?? [];
      const writes = state.writes.get(key) ?? [];

      return parses.some(
        (parseNode) =>
          parseDominatesAssertion(parseNode, node) &&
          !writes.some(
            (writeNode) =>
              writeNode.range[0] > parseNode.range[1] && writeNode.range[0] < node.range[0],
          ),
      );
    }

    function recordResponseWrite(node: ESTree.Node, expression: ESTree.Node): void {
      const key = responseKey(expression);
      if (key !== undefined) {
        addEvidence(stateFor(node).writes, key, node);
      }
    }

    function checkParseBody(node: ESTree.CallExpression): void {
      if (node.callee.type !== "Identifier" || node.callee.name !== "parseBody") {
        return;
      }

      const [response, schema] = node.arguments;
      if (!response || !schema) {
        return;
      }

      if (!isContractSchema(schema)) {
        context.report({ node: schema, messageId: "nonContractSchema" });
        return;
      }

      const key = responseKey(response);
      if (key !== undefined) {
        addEvidence(stateFor(node).parses, key, node);
      }
    }

    function checkSchemaParse(node: ESTree.CallExpression): void {
      if (
        node.callee.type !== "MemberExpression" ||
        !SCHEMA_PARSE_METHODS.has(memberPropertyName(node.callee) ?? "") ||
        !isContractSchema(node.callee.object)
      ) {
        return;
      }

      const argument = unwrap(node.arguments[0]);
      const access = parsedBodyAccess(argument);
      if (!access || argument !== access) {
        return;
      }

      validatedParsedBodyAccesses.add(access);
      const key = responseKey(access.object);
      if (key !== undefined) {
        addEvidence(stateFor(node).parses, key, node);
      }
    }

    function checkParsedBodyAccess(node: ESTree.MemberExpression): void {
      if (memberPropertyName(node) !== "parsedBody" || validatedParsedBodyAccesses.has(node)) {
        return;
      }

      const key = responseKey(node.object);
      if (key === undefined || !hasContractParse(node, key)) {
        context.report({ node, messageId: "missingContractParse" });
      }
    }

    function expectCall(node: ESTree.CallExpression): ESTree.CallExpression | undefined {
      if (node.callee.type !== "MemberExpression") {
        return undefined;
      }

      let matcherTarget = node.callee.object;
      while (
        matcherTarget.type === "MemberExpression" &&
        MATCHER_MODIFIERS.has(memberPropertyName(matcherTarget) ?? "")
      ) {
        matcherTarget = matcherTarget.object;
      }

      if (
        matcherTarget.type !== "CallExpression" ||
        matcherTarget.callee.type !== "Identifier" ||
        matcherTarget.callee.name !== "expect"
      ) {
        return undefined;
      }

      return matcherTarget;
    }

    function checkWholeResponseAssertion(node: ESTree.CallExpression): void {
      const expectation = expectCall(node);
      if (!expectation) {
        return;
      }

      const assertsParsedBodyProperty = node.arguments.some((argument) =>
        objectContainsParsedBodyProperty(argument),
      );
      const matcherName =
        node.callee.type === "MemberExpression" ? memberPropertyName(node.callee) : undefined;
      const assertsParsedBodyPath =
        matcherName === "toHaveProperty" && isParsedBodyPropertyPath(node.arguments[0]);
      if (!assertsParsedBodyProperty && !assertsParsedBodyPath) {
        return;
      }

      const key = responseKey(expectation.arguments[0]);
      if (key !== undefined && !hasContractParse(node, key)) {
        context.report({
          node: expectation,
          messageId: "missingContractParse",
        });
      }
    }

    function checkParsedBodyDestructuring(node: ESTree.VariableDeclarator): void {
      if (node.id.type !== "ObjectPattern") {
        return;
      }

      const parsedBodyProperty = node.id.properties.find((property) => {
        if (property.type !== "Property") {
          return false;
        }

        return (
          (property.key.type === "Identifier" && property.key.name === "parsedBody") ||
          (property.key.type === "Literal" && property.key.value === "parsedBody")
        );
      });
      if (!parsedBodyProperty) {
        return;
      }

      const key = responseKey(node.init ?? undefined);
      if (key === undefined || !hasContractParse(node, key)) {
        context.report({
          node: parsedBodyProperty,
          messageId: "missingContractParse",
        });
      }
    }

    function checkInlineAnySchema(node: ESTree.CallExpression): void {
      if (node.callee.type !== "MemberExpression") {
        return;
      }

      const method = memberPropertyName(node.callee);
      const identifier = rootIdentifier(node.callee.object);
      if (!method || !ANY_SCHEMA_METHODS.has(method) || !identifier) {
        return;
      }

      const variable = findVariable(identifier);
      if (variable !== undefined && zodBindings.has(variable)) {
        context.report({
          node,
          messageId: "inlineAnySchema",
          data: { method },
        });
      }
    }

    return {
      ImportDeclaration(node) {
        if (node.source.value.startsWith(CONTRACT_PACKAGE_PREFIX)) {
          for (const specifier of node.specifiers) {
            const [variable] = context.sourceCode.getDeclaredVariables(specifier);
            if (variable) {
              contractBindings.add(variable);
            }
          }
        }

        if (node.source.value === "zod") {
          for (const specifier of node.specifiers) {
            const importsZodNamespace = specifier.type === "ImportNamespaceSpecifier";
            const importsZodDefault = specifier.type === "ImportDefaultSpecifier";
            const importsZodBinding =
              specifier.type === "ImportSpecifier" &&
              specifier.imported.type === "Identifier" &&
              specifier.imported.name === "z";
            if (!importsZodNamespace && !importsZodDefault && !importsZodBinding) {
              continue;
            }

            const [variable] = context.sourceCode.getDeclaredVariables(specifier);
            if (variable) {
              zodBindings.add(variable);
            }
          }
        }
      },
      CallExpression(node) {
        checkInlineAnySchema(node);
        checkParseBody(node);
        checkSchemaParse(node);
        checkWholeResponseAssertion(node);
      },
      MemberExpression: checkParsedBodyAccess,
      VariableDeclarator: checkParsedBodyDestructuring,
      AssignmentExpression(node) {
        recordResponseWrite(node, node.left);
      },
      UpdateExpression(node) {
        recordResponseWrite(node, node.argument);
      },
    };
  },
};

export default rule;
