/**
 * @fileoverview Require oRPC handlers to throw a failed `ServiceResult` as a declared error.
 *
 * In a handler passed to `implement(...).handler()`, a failure branch is the body of
 * `if (isFailure(result))`, `if (!isSuccess(result))` or `if (!result.isSuccess)`, or the `else` of
 * `if (isSuccess(result))` or `if (result.isSuccess)`. Every `throw` in it must throw
 * `toDeclaredError({ errors, error })` or one of the handler's own `errors` constructors, so the
 * response keeps the status and body the contract declares. A failure branch may still `return`,
 * for a handler that answers a failure with a success response.
 *
 * The rule is syntactic: it recognizes `implement` from `@orpc/nest` or `@orpc/server`,
 * `isFailure` and `isSuccess` from `@clipboard-health/util-ts`, and `toDeclaredError` from
 * `@clipboard-health/api-nestjs` by their imports. Throws outside a failure branch, such as a
 * `catch` block's, are out of scope.
 */
import type { ESTree, Rule, Variable } from "@oxlint/plugins";

import { findVariable } from "../../internal/findVariable";

const ORPC_PACKAGES = new Set(["@orpc/nest", "@orpc/server"]);
const UTIL_TS_PACKAGE = "@clipboard-health/util-ts";
const API_NESTJS_PACKAGE = "@clipboard-health/api-nestjs";

type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function;

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
    const bindings = {
      implement: new Set<Variable>(),
      isFailure: new Set<Variable>(),
      isSuccess: new Set<Variable>(),
      toDeclaredError: new Set<Variable>(),
    };
    const handlers = new Set<FunctionNode>();
    const errorsBindings = new Set<Variable>();

    function isBound(node: ESTree.Node | undefined, set: Set<Variable>): boolean {
      const current = unwrap(node);
      if (current?.type !== "Identifier") {
        return false;
      }

      const variable = findVariable(context.sourceCode, current);
      return variable !== undefined && set.has(variable);
    }

    function isCallTo(node: ESTree.Node | undefined, set: Set<Variable>): boolean {
      const current = unwrap(node);
      return current?.type === "CallExpression" && isBound(current.callee, set);
    }

    /** `implement(procedure)`, optionally followed by builder calls such as `.use(middleware)`. */
    function isImplementBuilder(node: ESTree.Node | undefined): boolean {
      let current = unwrap(node);

      while (current?.type === "CallExpression") {
        if (isBound(current.callee, bindings.implement)) {
          return true;
        }

        if (current.callee.type !== "MemberExpression") {
          return false;
        }

        current = unwrap(current.callee.object);
      }

      return false;
    }

    function recordErrorsBinding(handler: FunctionNode): void {
      const [options] = handler.params;
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

      return isCallTo(current, bindings.isSuccess);
    }

    /** The statement that runs when the `if` sees a failed `ServiceResult`, if it tests one. */
    function failureBranch(node: ESTree.IfStatement): ESTree.Statement | undefined {
      const test = unwrap(node.test);

      if (isCallTo(test, bindings.isFailure)) {
        return node.consequent;
      }

      if (test?.type === "UnaryExpression" && test.operator === "!") {
        return isSuccessCheck(test.argument) ? node.consequent : undefined;
      }

      return isSuccessCheck(test) ? (node.alternate ?? undefined) : undefined;
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

    function isDeclaredError(node: ESTree.Node | undefined): boolean {
      const thrown = unwrap(node);
      if (thrown?.type !== "CallExpression") {
        return false;
      }

      if (isBound(thrown.callee, bindings.toDeclaredError)) {
        return true;
      }

      const callee = unwrap(thrown.callee);
      return callee?.type === "MemberExpression" && isBound(callee.object, errorsBindings);
    }

    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        const wanted: Record<string, Set<Variable>> = ORPC_PACKAGES.has(source)
          ? { implement: bindings.implement }
          : source === UTIL_TS_PACKAGE
            ? { isFailure: bindings.isFailure, isSuccess: bindings.isSuccess }
            : source === API_NESTJS_PACKAGE
              ? { toDeclaredError: bindings.toDeclaredError }
              : {};

        for (const specifier of node.specifiers) {
          const set = wanted[importedName(specifier) ?? ""];
          const [variable] = context.sourceCode.getDeclaredVariables(specifier);
          if (set && variable) {
            set.add(variable);
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
