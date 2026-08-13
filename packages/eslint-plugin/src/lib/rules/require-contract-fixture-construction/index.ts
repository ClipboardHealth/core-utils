import { AST_NODE_TYPES, ASTUtils, type TSESLint, type TSESTree } from "@typescript-eslint/utils";

import { createRule } from "../../createRule";

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

type Expression = TSESTree.Expression;
type FunctionNode =
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression;

interface Candidate {
  node: Expression;
  observationPosition: number;
}

interface IndirectExport {
  exportedName: string;
  local: TSESTree.Identifier;
}

interface PayloadMap {
  body?: Expression;
  json?: Expression;
  unknown?: Expression;
}

function unwrap(node: TSESTree.Node | undefined): TSESTree.Node | undefined {
  let current = node;

  while (
    current?.type === AST_NODE_TYPES.ChainExpression ||
    current?.type === AST_NODE_TYPES.TSAsExpression ||
    current?.type === AST_NODE_TYPES.TSInstantiationExpression ||
    current?.type === AST_NODE_TYPES.TSNonNullExpression ||
    current?.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    current?.type === AST_NODE_TYPES.TSTypeAssertion
  ) {
    current = current.expression;
  }

  return current;
}

function propertyName(node: TSESTree.MemberExpression | TSESTree.Property): string | undefined {
  const property = node.type === AST_NODE_TYPES.MemberExpression ? node.property : node.key;
  const computed = node.computed;
  if (!computed && property.type === AST_NODE_TYPES.Identifier) {
    return property.name;
  }
  if (computed && property.type === AST_NODE_TYPES.Literal && typeof property.value === "string") {
    return property.value;
  }
  return undefined;
}

function isExpression(node: TSESTree.Node | null | undefined): node is Expression {
  return (
    node !== null &&
    node !== undefined &&
    node.type !== AST_NODE_TYPES.SpreadElement &&
    node.type !== AST_NODE_TYPES.JSXElement &&
    node.type !== AST_NODE_TYPES.JSXFragment
  );
}

function rootIdentifier(node: TSESTree.Node | undefined): TSESTree.Identifier | undefined {
  let current = unwrap(node);
  while (current?.type === AST_NODE_TYPES.MemberExpression) {
    current = unwrap(current.object);
  }
  return current?.type === AST_NODE_TYPES.Identifier ? current : undefined;
}

function objectProperty(
  object: TSESTree.ObjectExpression,
  name: string,
): TSESTree.Property | undefined {
  return object.properties.find(
    (entry): entry is TSESTree.Property =>
      entry.type === AST_NODE_TYPES.Property && propertyName(entry) === name,
  );
}

function isRouteFulfillCall(node: TSESTree.CallExpression, allowAnyReceiver: boolean): boolean {
  return (
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    propertyName(node.callee) === "fulfill" &&
    node.callee.object.type === AST_NODE_TYPES.Identifier &&
    (allowAnyReceiver || /route$/iu.test(node.callee.object.name))
  );
}

function isFixtureValue(name: string, node: TSESTree.Node | undefined): boolean {
  const current = unwrap(node);
  return (
    MOCK_NAME_PATTERN.test(name) ||
    current?.type === AST_NODE_TYPES.ArrayExpression ||
    current?.type === AST_NODE_TYPES.ObjectExpression
  );
}

function importName(specifier: TSESTree.ImportClause): string {
  if (specifier.type === AST_NODE_TYPES.ImportSpecifier) {
    return specifier.imported.type === AST_NODE_TYPES.Identifier
      ? specifier.imported.name
      : specifier.imported.value;
  }
  return specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier ? "*" : "default";
}

const rule = createRule({
  name: "require-contract-fixture-construction",
  defaultOptions: [],
  meta: {
    type: "problem",
    docs: {
      description: "Require response fixtures to be constructed by producer-owned contracts",
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
    const contractImports = new Map<TSESLint.Scope.Variable, string>();
    const fixtureBuilderFactoryImports = new Set<TSESLint.Scope.Variable>();
    const oneShotBuilderImports = new Set<TSESLint.Scope.Variable>();
    const httpResponseImports = new Set<TSESLint.Scope.Variable>();
    const trustedFixtureImports = new Set<TSESLint.Scope.Variable>();
    const variableInitializers = new Map<TSESLint.Scope.Variable, Expression>();
    const fixtureBuilders = new Set<TSESLint.Scope.Variable>();
    const mutations = new Map<TSESLint.Scope.Variable, number[]>();
    const aliasTargets = new Map<TSESLint.Scope.Variable, TSESLint.Scope.Variable>();
    const candidates: Candidate[] = [];
    const directFixtureCandidates: Candidate[] = [];
    const functionReturns = new Map<FunctionNode, Expression[]>();
    const functionStack: FunctionNode[] = [];
    const exportedFunctions = new Set<FunctionNode>();
    const indirectExports: IndirectExport[] = [];

    function variableFor(identifier: TSESTree.Identifier): TSESLint.Scope.Variable | undefined {
      return (
        ASTUtils.findVariable(context.sourceCode.getScope(identifier), identifier) ?? undefined
      );
    }

    function declaredVariable(node: TSESTree.Node): TSESLint.Scope.Variable | undefined {
      return context.sourceCode.getDeclaredVariables(node)[0];
    }

    function recordMutation(node: TSESTree.Node | undefined, position: number): void {
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

    function wasMutated(variable: TSESLint.Scope.Variable, observationPosition: number): boolean {
      return mutations.get(variable)?.some((position) => position < observationPosition) === true;
    }

    function isContractRoot(identifier: TSESTree.Identifier): boolean {
      const variable = variableFor(identifier);
      return variable !== undefined && contractImports.has(variable);
    }

    function isContractResponseSchema(
      node: TSESTree.Node | undefined,
      seen = new Set<TSESLint.Scope.Variable>(),
    ): boolean {
      const current = unwrap(node);
      if (!current) {
        return false;
      }

      if (current.type === AST_NODE_TYPES.Identifier) {
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

      if (current.type !== AST_NODE_TYPES.MemberExpression) {
        return false;
      }

      const selectedFromResponses =
        current.computed &&
        current.object.type === AST_NODE_TYPES.MemberExpression &&
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

    function hasContractSchemaOption(call: TSESTree.CallExpression): boolean {
      const [options] = call.arguments;
      const current = unwrap(options);
      if (current?.type !== AST_NODE_TYPES.ObjectExpression) {
        return false;
      }
      const schema = objectProperty(current, "schema");
      return (
        schema !== undefined && isExpression(schema.value) && isContractResponseSchema(schema.value)
      );
    }

    function isOneShotBuilderCall(node: TSESTree.Node | undefined): boolean {
      const current = unwrap(node);
      if (
        current?.type !== AST_NODE_TYPES.CallExpression ||
        current.callee.type !== AST_NODE_TYPES.Identifier
      ) {
        return false;
      }
      const variable = variableFor(current.callee);
      return (
        variable !== undefined &&
        oneShotBuilderImports.has(variable) &&
        hasContractSchemaOption(current)
      );
    }

    function isFixtureBuilderFactoryCall(node: TSESTree.Node | undefined): boolean {
      const current = unwrap(node);
      if (
        current?.type !== AST_NODE_TYPES.CallExpression ||
        current.callee.type !== AST_NODE_TYPES.Identifier
      ) {
        return false;
      }
      const variable = variableFor(current.callee);
      return (
        variable !== undefined &&
        fixtureBuilderFactoryImports.has(variable) &&
        hasContractSchemaOption(current)
      );
    }

    function isContractParseCall(node: TSESTree.Node | undefined): boolean {
      const current = unwrap(node);
      return (
        current?.type === AST_NODE_TYPES.CallExpression &&
        current.callee.type === AST_NODE_TYPES.MemberExpression &&
        propertyName(current.callee) === "parse" &&
        isContractResponseSchema(current.callee.object)
      );
    }

    function isContractConstructed(
      node: TSESTree.Node | undefined,
      observationPosition: number,
      seen = new Set<TSESLint.Scope.Variable>(),
    ): boolean {
      const current = unwrap(node);
      if (!current) {
        return false;
      }
      if (isContractParseCall(current) || isOneShotBuilderCall(current)) {
        return true;
      }
      if (
        current.type === AST_NODE_TYPES.CallExpression &&
        current.callee.type === AST_NODE_TYPES.Identifier
      ) {
        const variable = variableFor(current.callee);
        if (variable !== undefined && fixtureBuilders.has(variable)) {
          return true;
        }
      }
      if (current.type !== AST_NODE_TYPES.Identifier) {
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
      node: TSESTree.Node | undefined,
      observationPosition: number,
      seen = new Set<TSESLint.Scope.Variable>(),
    ): TSESTree.ObjectExpression | undefined {
      const current = unwrap(node);
      if (current?.type === AST_NODE_TYPES.ObjectExpression) {
        return current;
      }
      if (current?.type !== AST_NODE_TYPES.Identifier) {
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
      node: TSESTree.Node | undefined,
      seen = new Set<TSESLint.Scope.Variable>(),
    ): Expression | undefined {
      const current = unwrap(node);
      if (
        current?.type === AST_NODE_TYPES.CallExpression &&
        current.callee.type === AST_NODE_TYPES.MemberExpression &&
        current.callee.object.type === AST_NODE_TYPES.Identifier &&
        current.callee.object.name === "JSON" &&
        propertyName(current.callee) === "stringify"
      ) {
        const [payload] = current.arguments;
        return isExpression(payload) ? payload : undefined;
      }
      if (current?.type !== AST_NODE_TYPES.Identifier) {
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
      node: TSESTree.Node | undefined,
      observationPosition: number,
      seen = new Set<TSESLint.Scope.Variable>(),
    ): PayloadMap {
      const options = resolveObject(node, observationPosition, seen);
      if (!options) {
        return isExpression(unwrap(node)) ? { unknown: unwrap(node) as Expression } : {};
      }

      const payloads: PayloadMap = {};
      for (const entry of options.properties) {
        if (entry.type === AST_NODE_TYPES.SpreadElement) {
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

    function isMswJsonCall(node: TSESTree.CallExpression): boolean {
      if (
        node.callee.type !== AST_NODE_TYPES.MemberExpression ||
        propertyName(node.callee) !== "json" ||
        node.callee.object.type !== AST_NODE_TYPES.Identifier
      ) {
        return false;
      }
      if (node.callee.object.name === "ctx" || node.callee.object.name === "context") {
        return true;
      }
      const variable = variableFor(node.callee.object);
      return variable !== undefined && httpResponseImports.has(variable);
    }

    function addCandidate(node: TSESTree.Node | undefined, observationPosition: number): void {
      if (isExpression(node)) {
        candidates.push({ node, observationPosition });
      }
    }

    function addDirectFixture(node: TSESTree.Node | null | undefined): void {
      if (isExpression(node)) {
        directFixtureCandidates.push({ node, observationPosition: node.range[0] });
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
        if (
          current?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          current?.type === AST_NODE_TYPES.FunctionExpression
        ) {
          for (const returnValue of functionReturns.get(current) ?? []) {
            if (!isContractConstructed(returnValue, returnValue.range[0])) {
              context.report({ node: returnValue, messageId: "parseMock" });
            }
          }
        } else if (
          isFixtureValue(exportedName, initializer) &&
          !isContractConstructed(initializer, initializer?.range[0] ?? local.range[0])
        ) {
          context.report({ node: initializer ?? local, messageId: "parseMock" });
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
        if (node.id.type !== AST_NODE_TYPES.Identifier) {
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
        if (node.parent.type === AST_NODE_TYPES.ExportNamedDeclaration && isMocksFile) {
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
        functionReturns.set(
          node,
          node.body.type === AST_NODE_TYPES.BlockStatement ? [] : [node.body],
        );
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
          if (
            specifier.type === AST_NODE_TYPES.ExportSpecifier &&
            specifier.local.type === AST_NODE_TYPES.Identifier
          ) {
            indirectExports.push({
              exportedName:
                specifier.exported.type === AST_NODE_TYPES.Identifier
                  ? specifier.exported.name
                  : specifier.exported.value,
              local: specifier.local,
            });
          }
        }
        if (node.declaration?.type !== AST_NODE_TYPES.VariableDeclaration) {
          return;
        }
        for (const declaration of node.declaration.declarations) {
          if (
            declaration.id.type !== AST_NODE_TYPES.Identifier ||
            !isExpression(declaration.init)
          ) {
            addDirectFixture(declaration.init);
            continue;
          }
          const initializer = unwrap(declaration.init);
          if (
            initializer?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            initializer?.type === AST_NODE_TYPES.FunctionExpression
          ) {
            exportedFunctions.add(initializer);
          } else if (isFixtureValue(declaration.id.name, declaration.init)) {
            addDirectFixture(declaration.init);
          }
        }
      },
      ExportDefaultDeclaration(node) {
        if (!isMocksFile) {
          return;
        }
        if (node.declaration.type === AST_NODE_TYPES.Identifier) {
          indirectExports.push({ exportedName: node.declaration.name, local: node.declaration });
        } else if (isExpression(node.declaration)) {
          const current = unwrap(node.declaration);
          if (
            current?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            current?.type === AST_NODE_TYPES.FunctionExpression
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

        if (node.callee.type === AST_NODE_TYPES.MemberExpression) {
          const method = propertyName(node.callee);
          if (
            node.callee.object.type === AST_NODE_TYPES.Identifier &&
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
});

export default rule;
