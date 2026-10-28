/**
 * @fileoverview Require oRPC handlers to throw a failed `ServiceResult` as a declared error.
 *
 * In a handler passed to `implement(...).handler()`, a failure branch is the body of
 * `if (isFailure(result))`, `if (!isSuccess(result))` or `if (!result.isSuccess)`, or the `else` of
 * `if (isSuccess(result))`, `if (result.isSuccess)` or `if (!isFailure(result))`. Every `throw` in
 * it must throw `toDeclaredError({ errors, error })` or one of the handler's own `errors`
 * constructors, so the response keeps the status and body the contract declares. A failure branch
 * may still `return`, for a handler that answers a failure with a success response.
 *
 * The rule is syntactic. It recognizes `implement` from `@orpc/nest` or `@orpc/server`, `isFailure`
 * and `isSuccess` from `@clipboard-health/util-ts`, and `toDeclaredError` from
 * `@clipboard-health/api-nestjs` by their named imports. The `result.isSuccess` form matches any
 * object's `isSuccess` property. Out of scope:
 * - throws outside a failure branch, such as a `catch` block's or one after an early
 *   `if (isSuccess(result)) return`;
 * - compound conditions, such as `isFailure(a) || isFailure(b)`;
 * - throws inside a function defined in the branch, such as a callback's;
 * - a handler reached through a variable, such as `const os = implement(contract)`.
 */
import type { ESTree, Rule, Variable } from "@oxlint/plugins";

import { findVariable } from "../../internal/findVariable";

type Binding = "implement" | "isFailure" | "isSuccess" | "toDeclaredError";
type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function;

/** The imports the rule tracks: package, then imported name. */
const TRACKED_IMPORTS = new Map<string, ReadonlyMap<string, Binding>>([
  ["@orpc/nest", new Map([["implement", "implement"]])],
  ["@orpc/server", new Map([["implement", "implement"]])],
  [
    "@clipboard-health/util-ts",
    new Map<string, Binding>([
      ["isFailure", "isFailure"],
      ["isSuccess", "isSuccess"],
    ]),
  ],
  ["@clipboard-health/api-nestjs", new Map([["toDeclaredError", "toDeclaredError"]])],
]);

function unwrap(node: ESTree.Node | null | undefined): ESTree.Node | undefined {
  let current = node ?? undefined;

  while (
    current?.type === "ChainExpression" ||
    current?.type === "TSAsExpression" ||
    current?.type === "TSNonNullExpression" ||
    current?.type === "TSSatisfiesExpression"
  ) {
    current = current.expression;
  }

  return current;
}

function isFunctionNode(node: ESTree.Node): node is FunctionNode {
  return (
    node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression"
  );
}

function memberPropertyName(node: ESTree.MemberExpression): string | undefined {
  return !node.computed && node.property.type === "Identifier" ? node.property.name : undefined;
}

function importedName(specifier: ESTree.ImportDeclarationSpecifier): string | undefined {
  if (specifier.type !== "ImportSpecifier") {
    return undefined;
  }

  return specifier.imported.type === "Identifier"
    ? specifier.imported.name
    : String(specifier.imported.value);
}

const rule: Rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require oRPC handlers to throw a failed ServiceResult with toDeclaredError so it keeps its declared status",
      url: "https://github.com/ClipboardHealth/core-utils/tree/main/packages/oxlint-plugin/src/lib/rules/require-to-declared-error",
    },
    schema: [],
    messages: {
      throwDeclaredError:
        "Throw `toDeclaredError({ errors, error })` from @clipboard-health/api-nestjs in an oRPC handler's failure branch, so the response keeps the status and body the contract declares.",
    },
  },

  create(context) {
    const bindings: Record<Binding, Set<Variable>> = {
      implement: new Set(),
      isFailure: new Set(),
      isSuccess: new Set(),
      toDeclaredError: new Set(),
    };
    const handlers = new Set<FunctionNode>();
    /** Each handler's `errors`, or its options parameter when it isn't destructured. */
    const errorsBindings = new Set<Variable>();
    const optionsBindings = new Set<Variable>();

    function variableOf(node: ESTree.Node | undefined): Variable | undefined {
      const current = unwrap(node);
      return current?.type === "Identifier" ? findVariable(context.sourceCode, current) : undefined;
    }

    function isBound(node: ESTree.Node | undefined, set: Set<Variable>): boolean {
      const variable = variableOf(node);
      return variable !== undefined && set.has(variable);
    }

    function isCallTo(node: ESTree.Node | undefined, binding: Binding): boolean {
      const current = unwrap(node);
      return current?.type === "CallExpression" && isBound(current.callee, bindings[binding]);
    }

    /**
     * `implement(contract)`, through builder calls such as `.use(middleware)` and router members
     * such as `implement(contract).shifts.list`.
     */
    function isImplementBuilder(node: ESTree.Node | undefined): boolean {
      let current = unwrap(node);

      while (current) {
        if (current.type === "CallExpression") {
          if (isBound(current.callee, bindings.implement)) {
            return true;
          }

          current = unwrap(current.callee);
        } else if (current.type === "MemberExpression") {
          current = unwrap(current.object);
        } else {
          return false;
        }
      }

      return false;
    }

    function recordErrorsBinding(handler: FunctionNode): void {
      const [options] = handler.params;
      if (options?.type === "Identifier") {
        const variable = findVariable(context.sourceCode, options);
        if (variable) {
          optionsBindings.add(variable);
        }
        return;
      }

      if (options?.type !== "ObjectPattern") {
        return;
      }

      for (const property of options.properties) {
        if (
          property.type === "Property" &&
          !property.computed &&
          property.key.type === "Identifier" &&
          property.key.name === "errors" &&
          property.value.type === "Identifier"
        ) {
          const variable = findVariable(context.sourceCode, property.value);
          if (variable) {
            errorsBindings.add(variable);
          }
        }
      }
    }

    function isSuccessCheck(node: ESTree.Node | undefined): boolean {
      const current = unwrap(node);
      if (current?.type === "MemberExpression") {
        return memberPropertyName(current) === "isSuccess";
      }

      return isCallTo(current, "isSuccess");
    }

    /** The statement that runs when the `if` sees a failed `ServiceResult`, if it tests one. */
    function failureBranch(node: ESTree.IfStatement): ESTree.Statement | undefined {
      const test = unwrap(node.test);
      const alternate = node.alternate ?? undefined;

      if (isCallTo(test, "isFailure")) {
        return node.consequent;
      }

      if (test?.type === "UnaryExpression" && test.operator === "!") {
        if (isSuccessCheck(test.argument)) {
          return node.consequent;
        }

        return isCallTo(test.argument, "isFailure") ? alternate : undefined;
      }

      return isSuccessCheck(test) ? alternate : undefined;
    }

    function isInFailureBranch(node: ESTree.ThrowStatement): boolean {
      let child: ESTree.Node = node;
      let parent: ESTree.Node | null = node.parent;

      while (parent && !isFunctionNode(parent)) {
        if (parent.type === "IfStatement" && failureBranch(parent) === child) {
          return true;
        }

        child = parent;
        ({ parent } = parent);
      }

      return false;
    }

    function isInHandler(node: ESTree.Node): boolean {
      let parent: ESTree.Node | null = node.parent;

      while (parent) {
        if (isFunctionNode(parent) && handlers.has(parent)) {
          return true;
        }

        ({ parent } = parent);
      }

      return false;
    }

    /** `errors.CODE` or `options.errors.CODE` from the handler's options. */
    function isErrorsConstructor(node: ESTree.Node | undefined): boolean {
      const callee = unwrap(node);
      if (callee?.type !== "MemberExpression") {
        return false;
      }

      const owner = unwrap(callee.object);
      if (isBound(owner, errorsBindings)) {
        return true;
      }

      return (
        owner?.type === "MemberExpression" &&
        memberPropertyName(owner) === "errors" &&
        isBound(owner.object, optionsBindings)
      );
    }

    function isDeclaredError(node: ESTree.Node | undefined): boolean {
      const thrown = unwrap(node);
      return (
        thrown?.type === "CallExpression" &&
        (isBound(thrown.callee, bindings.toDeclaredError) || isErrorsConstructor(thrown.callee))
      );
    }

    return {
      ImportDeclaration(node) {
        const tracked = TRACKED_IMPORTS.get(node.source.value);
        if (!tracked) {
          return;
        }

        for (const specifier of node.specifiers) {
          const binding = tracked.get(importedName(specifier) ?? "");
          const [variable] = context.sourceCode.getDeclaredVariables(specifier);
          if (binding && variable) {
            bindings[binding].add(variable);
          }
        }
      },
      CallExpression(node) {
        const callee = unwrap(node.callee);
        if (
          callee?.type !== "MemberExpression" ||
          memberPropertyName(callee) !== "handler" ||
          !isImplementBuilder(callee.object)
        ) {
          return;
        }

        const handler = unwrap(node.arguments[0]);
        if (handler && isFunctionNode(handler)) {
          handlers.add(handler);
          recordErrorsBinding(handler);
        }
      },
      ThrowStatement(node) {
        if (isDeclaredError(node.argument) || !isInFailureBranch(node) || !isInHandler(node)) {
          return;
        }

        context.report({ node, messageId: "throwDeclaredError" });
      },
    };
  },
};

export default rule;
