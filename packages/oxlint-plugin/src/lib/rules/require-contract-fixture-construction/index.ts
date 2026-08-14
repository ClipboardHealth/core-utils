import type { ESTree, Rule, Variable } from "@oxlint/plugins";

import { findVariable as findVariableInScope } from "../../internal/findVariable";

const CONTRACT_PACKAGE_PREFIX = "@clipboard-health/contract-";
const MOCKS_FILE_PATTERN = /\/(?:testUtils|test-utils)\/mocks\.[cm]?[jt]sx?$/u;
const MOCK_NAME_PATTERN = /mock/iu;
const MUTATING_METHOD_NAMES = new Set([
  "add",
  "clear",
  "copyWithin",
  "delete",
  "fill",
  "pop",
  "push",
  "reverse",
  "set",
  "shift",
  "sort",
  "splice",
  "unshift",
]);
const OBJECT_MUTATOR_NAMES = new Set([
  "assign",
  "defineProperties",
  "defineProperty",
  "setPrototypeOf",
]);

type Expression = ESTree.Expression;
type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function;
type Identifier = ESTree.BindingIdentifier | ESTree.IdentifierName | ESTree.IdentifierReference;

interface Candidate {
  node: Expression;
  observationPosition: number;
}

interface IndirectExport {
  exportedName: string;
  local: Identifier;
}

interface PayloadMap {
  body?: Expression;
  json?: Expression;
  unknown?: Expression;
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

function propertyName(node: ESTree.MemberExpression | ESTree.ObjectProperty): string | undefined {
  const property = node.type === "MemberExpression" ? node.property : node.key;
  const computed = node.computed;
  if (!computed && property.type === "Identifier") {
    return property.name;
  }
  if (computed && property.type === "Literal" && typeof property.value === "string") {
    return property.value;
  }
  return undefined;
}

function isExpression(node: ESTree.Node | null | undefined): node is Expression {
  return (
    node !== null &&
    node !== undefined &&
    node.type !== "SpreadElement" &&
    node.type !== "JSXElement" &&
    node.type !== "JSXFragment"
  );
}

function rootIdentifier(node: ESTree.Node | undefined): Identifier | undefined {
  let current = unwrap(node);
  while (current?.type === "MemberExpression") {
    current = unwrap(current.object);
  }
  return current?.type === "Identifier" ? current : undefined;
}

function objectProperty(
  object: ESTree.ObjectExpression,
  name: string,
): ESTree.ObjectProperty | undefined {
  return object.properties.find(
    (entry): entry is ESTree.ObjectProperty =>
      entry.type === "Property" && propertyName(entry) === name,
  );
}

function isRouteFulfillCall(node: ESTree.CallExpression, allowAnyReceiver: boolean): boolean {
  return (
    node.callee.type === "MemberExpression" &&
    propertyName(node.callee) === "fulfill" &&
    node.callee.object.type === "Identifier" &&
    (allowAnyReceiver || /route$/iu.test(node.callee.object.name))
  );
}

function isFixtureValue(name: string, node: ESTree.Node | undefined): boolean {
  const current = unwrap(node);
  return (
    MOCK_NAME_PATTERN.test(name) ||
    current?.type === "ArrayExpression" ||
    current?.type === "ObjectExpression"
  );
}

function importName(specifier: ESTree.ImportDeclarationSpecifier): string {
  if (specifier.type === "ImportSpecifier") {
    return specifier.imported.type === "Identifier"
      ? specifier.imported.name
      : specifier.imported.value;
  }
  return specifier.type === "ImportNamespaceSpecifier" ? "*" : "default";
}

const rule: Rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Require response fixtures to be constructed by producer-owned contracts",
      url: "https://github.com/ClipboardHealth/core-utils/tree/main/packages/eslint-plugin/src/lib/rules/require-contract-fixture-construction",
    },
    schema: [],
    messages: {
      parseMock:
        "Construct exported response fixtures with a producer-owned contract response schema.",
      parsePayload:
        "Construct JSON response fixtures with a producer-owned contract response schema before passing them to the test transport.",
    },
  },
  create(context) {
    const filename = context.filename.replaceAll("\\", "/");
    const isMocksFile = MOCKS_FILE_PATTERN.test(filename);
    const isPlaywrightFile = filename.includes("/playwright/");
    const isTestUtilsFile = /\/(?:testUtils|test-utils)\//u.test(filename);
    const contractImports = new Map<Variable, string>();
    const fixtureBuilderFactoryImports = new Set<Variable>();
    const oneShotBuilderImports = new Set<Variable>();
    const httpResponseImports = new Set<Variable>();
    const trustedFixtureImports = new Set<Variable>();
    const variableInitializers = new Map<Variable, Expression>();
    const fixtureBuilders = new Set<Variable>();
    const mutations = new Map<Variable, number[]>();
    const aliasTargets = new Map<Variable, Variable>();
    const candidates: Candidate[] = [];
    const directFixtureCandidates: Candidate[] = [];
    const functionReturns = new Map<FunctionNode, Expression[]>();
    const functionStack: FunctionNode[] = [];
    const exportedFunctions = new Set<FunctionNode>();
    const indirectExports: IndirectExport[] = [];

    function variableFor(identifier: Identifier): Variable | undefined {
      return findVariableInScope(context.sourceCode, identifier);
    }

    function declaredVariable(node: ESTree.Node): Variable | undefined {
      return context.sourceCode.getDeclaredVariables(node)[0];
    }

    function recordMutation(node: ESTree.Node | undefined, position: number): void {
      const identifier = rootIdentifier(node);
      if (!identifier) {
        return;
      }
      const variable = variableFor(identifier);
      if (!variable) {
        return;
      }
      const positions = mutations.get(variable) ?? [];
      positions.push(position);
      mutations.set(variable, positions);
    }

    function wasMutated(variable: Variable, observationPosition: number): boolean {
      return mutations.get(variable)?.some((position) => position < observationPosition) === true;
    }

    function isContractRoot(identifier: Identifier): boolean {
      const variable = variableFor(identifier);
      return variable !== undefined && contractImports.has(variable);
    }

    function isContractResponseSchema(
      node: ESTree.Node | undefined,
      seen = new Set<Variable>(),
    ): boolean {
      const current = unwrap(node);
      if (!current) {
        return false;
      }

      if (current.type === "Identifier") {
        const variable = variableFor(current);
        if (!variable) {
          return false;
        }
        const importedName = contractImports.get(variable);
        if (importedName !== undefined) {
          return importedName.endsWith("ResponseSchema");
        }
        if (seen.has(variable)) {
          return false;
        }
        seen.add(variable);
        return isContractResponseSchema(variableInitializers.get(variable), seen);
      }

      if (current.type !== "MemberExpression") {
        return false;
      }

      const selectedFromResponses =
        current.computed &&
        current.object.type === "MemberExpression" &&
        propertyName(current.object) === "responses";
      if (selectedFromResponses) {
        const root = rootIdentifier(current);
        return root !== undefined && isContractRoot(root);
      }

      const selectedNamedSchema = propertyName(current)?.endsWith("ResponseSchema") === true;
      if (selectedNamedSchema) {
        const root = rootIdentifier(current);
        return root !== undefined && isContractRoot(root);
      }

      return false;
    }

    function hasContractSchemaOption(call: ESTree.CallExpression): boolean {
      const [options] = call.arguments;
      const current = unwrap(options);
      if (current?.type !== "ObjectExpression") {
        return false;
      }
      const schema = objectProperty(current, "schema");
      return (
        schema !== undefined && isExpression(schema.value) && isContractResponseSchema(schema.value)
      );
    }

    function isOneShotBuilderCall(node: ESTree.Node | undefined): boolean {
      const current = unwrap(node);
      if (current?.type !== "CallExpression" || current.callee.type !== "Identifier") {
        return false;
      }
      const variable = variableFor(current.callee);
      return (
        variable !== undefined &&
        oneShotBuilderImports.has(variable) &&
        hasContractSchemaOption(current)
      );
    }

    function isFixtureBuilderFactoryCall(node: ESTree.Node | undefined): boolean {
      const current = unwrap(node);
      if (current?.type !== "CallExpression" || current.callee.type !== "Identifier") {
        return false;
      }
      const variable = variableFor(current.callee);
      return (
        variable !== undefined &&
        fixtureBuilderFactoryImports.has(variable) &&
        hasContractSchemaOption(current)
      );
    }

    function isContractParseCall(node: ESTree.Node | undefined): boolean {
      const current = unwrap(node);
      return (
        current?.type === "CallExpression" &&
        current.callee.type === "MemberExpression" &&
        propertyName(current.callee) === "parse" &&
        isContractResponseSchema(current.callee.object)
      );
    }

    function isContractConstructed(
      node: ESTree.Node | undefined,
      observationPosition: number,
      seen = new Set<Variable>(),
    ): boolean {
      const current = unwrap(node);
      if (!current) {
        return false;
      }
      if (isContractParseCall(current) || isOneShotBuilderCall(current)) {
        return true;
      }
      if (current.type === "CallExpression" && current.callee.type === "Identifier") {
        const variable = variableFor(current.callee);
        if (variable !== undefined && fixtureBuilders.has(variable)) {
          return true;
        }
      }
      if (current.type !== "Identifier") {
        return false;
      }
      const variable = variableFor(current);
      if (!variable || seen.has(variable) || wasMutated(variable, observationPosition)) {
        return false;
      }
      if (trustedFixtureImports.has(variable)) {
        return true;
      }
      const initializer = variableInitializers.get(variable);
      if (!initializer) {
        return false;
      }
      seen.add(variable);
      return isContractConstructed(initializer, observationPosition, seen);
    }

    function resolveObject(
      node: ESTree.Node | undefined,
      observationPosition: number,
      seen = new Set<Variable>(),
    ): ESTree.ObjectExpression | undefined {
      const current = unwrap(node);
      if (current?.type === "ObjectExpression") {
        return current;
      }
      if (current?.type !== "Identifier") {
        return undefined;
      }
      const variable = variableFor(current);
      if (!variable || seen.has(variable) || wasMutated(variable, observationPosition)) {
        return undefined;
      }
      const initializer = variableInitializers.get(variable);
      if (!initializer) {
        return undefined;
      }
      seen.add(variable);
      return resolveObject(initializer, observationPosition, seen);
    }

    function jsonStringifyPayload(
      node: ESTree.Node | undefined,
      seen = new Set<Variable>(),
    ): Expression | undefined {
      const current = unwrap(node);
      if (
        current?.type === "CallExpression" &&
        current.callee.type === "MemberExpression" &&
        current.callee.object.type === "Identifier" &&
        current.callee.object.name === "JSON" &&
        propertyName(current.callee) === "stringify"
      ) {
        const [payload] = current.arguments;
        return isExpression(payload) ? payload : undefined;
      }
      if (current?.type !== "Identifier") {
        return undefined;
      }
      const variable = variableFor(current);
      if (!variable || seen.has(variable)) {
        return undefined;
      }
      seen.add(variable);
      return jsonStringifyPayload(variableInitializers.get(variable), seen);
    }

    function playwrightPayloads(
      node: ESTree.Node | undefined,
      observationPosition: number,
      seen = new Set<Variable>(),
    ): PayloadMap {
      const options = resolveObject(node, observationPosition, seen);
      if (!options) {
        const expression = unwrap(node);
        return isExpression(expression) ? { unknown: expression } : {};
      }

      const payloads: PayloadMap = {};
      for (const entry of options.properties) {
        if (entry.type === "SpreadElement") {
          const spread = playwrightPayloads(entry.argument, observationPosition, new Set(seen));
          if (spread.unknown) {
            return { unknown: spread.unknown };
          }
          if (spread.body !== undefined) {
            payloads.body = spread.body;
          }
          if (spread.json !== undefined) {
            payloads.json = spread.json;
          }
          continue;
        }
        const name = propertyName(entry);
        if (name === undefined && entry.computed && isExpression(entry.value)) {
          return { unknown: entry.value };
        }
        if (!isExpression(entry.value)) {
          continue;
        }
        if (name === "json") {
          payloads.json = entry.value;
        } else if (name === "body") {
          const serialized = jsonStringifyPayload(entry.value);
          if (serialized) {
            payloads.body = serialized;
          }
        }
      }
      return payloads;
    }

    function isMswJsonCall(node: ESTree.CallExpression): boolean {
      if (
        node.callee.type !== "MemberExpression" ||
        propertyName(node.callee) !== "json" ||
        node.callee.object.type !== "Identifier"
      ) {
        return false;
      }
      if (node.callee.object.name === "ctx" || node.callee.object.name === "context") {
        return true;
      }
      const variable = variableFor(node.callee.object);
      return variable !== undefined && httpResponseImports.has(variable);
    }

    function addCandidate(node: ESTree.Node | undefined, observationPosition: number): void {
      if (isExpression(node)) {
        candidates.push({ node, observationPosition });
      }
    }

    function addDirectFixture(node: ESTree.Node | null | undefined): void {
      if (isExpression(node)) {
        directFixtureCandidates.push({
          node,
          observationPosition: Number.MAX_SAFE_INTEGER,
        });
      }
    }

    function registerBuilderVariables(): void {
      let changed = true;
      while (changed) {
        changed = false;
        for (const [variable, initializer] of variableInitializers) {
          if (!fixtureBuilders.has(variable) && isFixtureBuilderFactoryCall(initializer)) {
            fixtureBuilders.add(variable);
            changed = true;
          }
        }
      }
    }

    function propagateAliasMutations(): void {
      let changed = true;
      while (changed) {
        changed = false;
        for (const [alias, target] of aliasTargets) {
          const aliasMutations = mutations.get(alias) ?? [];
          const targetMutations = mutations.get(target) ?? [];
          for (const position of aliasMutations) {
            if (!targetMutations.includes(position)) {
              targetMutations.push(position);
              changed = true;
            }
          }
          if (targetMutations.length > 0) {
            mutations.set(target, targetMutations);
          }
        }
      }
    }

    function reportDirectFixtures(): void {
      for (const candidate of directFixtureCandidates) {
        if (!isContractConstructed(candidate.node, candidate.observationPosition)) {
          context.report({ node: candidate.node, messageId: "parseMock" });
        }
      }
    }

    function reportExportedFunctions(): void {
      for (const functionNode of exportedFunctions) {
        for (const returnValue of functionReturns.get(functionNode) ?? []) {
          if (!isContractConstructed(returnValue, returnValue.range[0])) {
            context.report({ node: returnValue, messageId: "parseMock" });
          }
        }
      }
    }

    function reportIndirectExports(): void {
      for (const { exportedName, local } of indirectExports) {
        const variable = variableFor(local);
        if (!variable) {
          continue;
        }
        const initializer = variableInitializers.get(variable);
        const current = unwrap(initializer);
        if (current?.type === "ArrowFunctionExpression" || current?.type === "FunctionExpression") {
          for (const returnValue of functionReturns.get(current) ?? []) {
            if (!isContractConstructed(returnValue, returnValue.range[0])) {
              context.report({ node: returnValue, messageId: "parseMock" });
            }
          }
        } else if (
          isFixtureValue(exportedName, initializer) &&
          !isContractConstructed(local, Number.MAX_SAFE_INTEGER)
        ) {
          context.report({
            node: initializer ?? local,
            messageId: "parseMock",
          });
        }
      }
    }

    function reportTransportCandidates(): void {
      for (const candidate of candidates) {
        if (!isContractConstructed(candidate.node, candidate.observationPosition)) {
          context.report({ node: candidate.node, messageId: "parsePayload" });
        }
      }
    }

    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        for (const specifier of node.specifiers) {
          const variable = declaredVariable(specifier);
          if (!variable) {
            continue;
          }
          const importedName = importName(specifier);
          if (source.startsWith(CONTRACT_PACKAGE_PREFIX)) {
            contractImports.set(variable, importedName);
          }
          if (
            (source === "@clipboard-health/testing-core" ||
              /(?:^|\/)test(?:Utils|-utils)\/createContractFixtureBuilder$/u.test(source)) &&
            importedName === "createContractFixtureBuilder"
          ) {
            fixtureBuilderFactoryImports.add(variable);
          }
          if (
            (source === "@clipboard-health/testing-core" ||
              /(?:^|\/)test(?:Utils|-utils)\/buildContractFixture$/u.test(source)) &&
            importedName === "buildContractFixture"
          ) {
            oneShotBuilderImports.add(variable);
          }
          if (source === "msw" && importedName === "HttpResponse") {
            httpResponseImports.add(variable);
          }
          if (
            /(?:^|\/)test(?:Utils|-utils)\/mocks$/u.test(source) ||
            (isTestUtilsFile && /^\.\/mocks$/u.test(source))
          ) {
            trustedFixtureImports.add(variable);
          }
        }
      },
      VariableDeclarator(node) {
        if (!isExpression(node.init)) {
          return;
        }
        if (node.id.type !== "Identifier") {
          const aliasIdentifier = rootIdentifier(node.init);
          const target = aliasIdentifier ? variableFor(aliasIdentifier) : undefined;
          if (target) {
            for (const variable of context.sourceCode.getDeclaredVariables(node)) {
              aliasTargets.set(variable, target);
            }
          }
          return;
        }
        const variable = declaredVariable(node);
        if (!variable) {
          return;
        }
        variableInitializers.set(variable, node.init);
        const aliasIdentifier = rootIdentifier(node.init);
        const target = aliasIdentifier ? variableFor(aliasIdentifier) : undefined;
        if (target && target !== variable) {
          aliasTargets.set(variable, target);
        }
      },
      FunctionDeclaration(node) {
        functionReturns.set(node, []);
        functionStack.push(node);
        if (node.parent.type === "ExportNamedDeclaration" && isMocksFile) {
          exportedFunctions.add(node);
        }
      },
      "FunctionDeclaration:exit"() {
        functionStack.pop();
      },
      FunctionExpression(node) {
        functionReturns.set(node, []);
        functionStack.push(node);
      },
      "FunctionExpression:exit"() {
        functionStack.pop();
      },
      ArrowFunctionExpression(node) {
        functionReturns.set(node, node.body.type === "BlockStatement" ? [] : [node.body]);
        functionStack.push(node);
      },
      "ArrowFunctionExpression:exit"() {
        functionStack.pop();
      },
      ReturnStatement(node) {
        const current = functionStack.at(-1);
        if (current && isExpression(node.argument)) {
          functionReturns.get(current)?.push(node.argument);
        }
      },
      ExportNamedDeclaration(node) {
        if (!isMocksFile) {
          return;
        }
        for (const specifier of node.specifiers) {
          if (specifier.type === "ExportSpecifier" && specifier.local.type === "Identifier") {
            indirectExports.push({
              exportedName:
                specifier.exported.type === "Identifier"
                  ? specifier.exported.name
                  : specifier.exported.value,
              local: specifier.local,
            });
          }
        }
        if (node.declaration?.type !== "VariableDeclaration") {
          return;
        }
        for (const declaration of node.declaration.declarations) {
          if (declaration.id.type !== "Identifier" || !isExpression(declaration.init)) {
            addDirectFixture(declaration.init);
            continue;
          }
          const initializer = unwrap(declaration.init);
          if (
            initializer?.type === "ArrowFunctionExpression" ||
            initializer?.type === "FunctionExpression"
          ) {
            exportedFunctions.add(initializer);
          } else if (isFixtureValue(declaration.id.name, declaration.init)) {
            addDirectFixture(declaration.id);
          }
        }
      },
      ExportDefaultDeclaration(node) {
        if (!isMocksFile) {
          return;
        }
        if (node.declaration.type === "Identifier") {
          indirectExports.push({
            exportedName: node.declaration.name,
            local: node.declaration,
          });
        } else if (isExpression(node.declaration)) {
          const current = unwrap(node.declaration);
          if (
            current?.type === "ArrowFunctionExpression" ||
            current?.type === "FunctionExpression"
          ) {
            exportedFunctions.add(current);
          } else {
            addDirectFixture(node.declaration);
          }
        }
      },
      AssignmentExpression(node) {
        recordMutation(node.left, node.range[0]);
      },
      UpdateExpression(node) {
        recordMutation(node.argument, node.range[0]);
      },
      UnaryExpression(node) {
        if (node.operator === "delete") {
          recordMutation(node.argument, node.range[0]);
        }
      },
      CallExpression(node) {
        if (isMswJsonCall(node)) {
          addCandidate(node.arguments[0], node.range[0]);
        }
        if (isRouteFulfillCall(node, isPlaywrightFile)) {
          const payloads = playwrightPayloads(node.arguments[0], node.range[0]);
          addCandidate(payloads.unknown ?? payloads.json ?? payloads.body, node.range[0]);
        }

        if (node.callee.type === "MemberExpression") {
          const method = propertyName(node.callee);
          if (
            node.callee.object.type === "Identifier" &&
            node.callee.object.name === "Object" &&
            OBJECT_MUTATOR_NAMES.has(method ?? "")
          ) {
            recordMutation(node.arguments[0], node.range[0]);
          } else if (MUTATING_METHOD_NAMES.has(method ?? "")) {
            recordMutation(node.callee.object, node.range[0]);
          }
        }
      },
      "Program:exit"() {
        registerBuilderVariables();
        propagateAliasMutations();
        reportDirectFixtures();
        reportExportedFunctions();
        reportIndirectExports();
        reportTransportCandidates();
      },
    };
  },
};

export default rule;
