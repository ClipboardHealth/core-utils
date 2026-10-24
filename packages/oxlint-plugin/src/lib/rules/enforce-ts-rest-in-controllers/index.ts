import { defineRule, type ESTree } from "@oxlint/plugins";

type MessageId =
  | "missingDecorator"
  | "missingReturn"
  | "decoratorNotFromPackage"
  | "callNotFromPackage"
  | "conflictingDecorators"
  | "tsRestHandlerForbidden";

interface Options {
  forbidTsRestHandler?: boolean;
}

/**
 * One way to implement a contract route in a Nest controller: a method decorator plus the handler
 * call the method must return, both imported from the library's Nest adapter.
 */
interface HandlerStyle {
  decorator: string;
  handlerFunction: string;
  source: string;
  expectedReturn: string;
  /**
   * Returns the call to `handlerFunction` when `node` is the expected return expression, so its
   * import can be checked, or `undefined` when `node` has another shape.
   */
  handlerCall: (node: ESTree.Expression) => ESTree.Expression | undefined;
}

/** `@TsRestHandler(...)` with `return tsRestHandler(...)`. */
const TS_REST: HandlerStyle = {
  decorator: "TsRestHandler",
  handlerFunction: "tsRestHandler",
  source: "@ts-rest/nest",
  expectedReturn: "`tsRestHandler(…)` from `@ts-rest/nest`",
  handlerCall: (node) => (calleeIdentifierName(node) === "tsRestHandler" ? node : undefined),
};

/** `@Implement(...)` with `return implement(...).handler(...)`. */
const ORPC: HandlerStyle = {
  decorator: "Implement",
  handlerFunction: "implement",
  source: "@orpc/nest",
  expectedReturn: "`implement(…).handler(…)` from `@orpc/nest`",
  handlerCall: implementCallOfHandlerChain,
};

const DOCS_REFERENCE =
  "See https://www.notion.so/BP-REST-API-f769b7fe745c4cf38f6eca2e9ad8a843 for more information.";

function calleeIdentifierName(node: ESTree.Expression | null | undefined): string | undefined {
  return node?.type === "CallExpression" && node.callee.type === "Identifier"
    ? node.callee.name
    : undefined;
}

function memberPropertyName(node: ESTree.Expression): string | undefined {
  return node.type === "MemberExpression" && !node.computed && node.property.type === "Identifier"
    ? node.property.name
    : undefined;
}

/**
 * Returns the `implement(...)` call at the root of `implement(...).handler(...)`, allowing builder
 * calls such as `.use(...)` between them, or `undefined` when the expression has another shape.
 */
function implementCallOfHandlerChain(node: ESTree.Expression): ESTree.Expression | undefined {
  if (node.type !== "CallExpression" || memberPropertyName(node.callee) !== "handler") {
    return undefined;
  }

  let current: ESTree.Expression = node;
  while (current.type === "CallExpression" && current.callee.type === "MemberExpression") {
    current = current.callee.object;
  }

  return calleeIdentifierName(current) === "implement" ? current : undefined;
}

function decoratorCalls(node: ESTree.MethodDefinition, name: string): ESTree.Decorator[] {
  return (node.decorators ?? []).filter(
    (decorator) => calleeIdentifierName(decorator.expression) === name,
  );
}

function soleReturnArgument(node: ESTree.MethodDefinition): ESTree.Expression | undefined {
  const body = node.value.body;
  if (
    body?.type !== "BlockStatement" ||
    body.body.length !== 1 ||
    body.body[0]?.type !== "ReturnStatement"
  ) {
    return undefined;
  }

  return body.body[0].argument ?? undefined;
}

function describeAlternatives(
  styles: readonly HandlerStyle[],
  describe: (style: HandlerStyle) => string,
): string {
  return styles.map(describe).join(" or ");
}

const rule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Require controller methods to implement a contract route with ts-rest or oRPC",
      url: "https://github.com/ClipboardHealth/core-utils/tree/main/packages/eslint-plugin/src/lib/rules/enforce-ts-rest-in-controllers",
    },
    schema: [
      {
        type: "object",
        properties: {
          forbidTsRestHandler: {
            type: "boolean",
            description:
              "Reject `@TsRestHandler` and `tsRestHandler()`, so controllers accept only oRPC's `@Implement`. Enable it once a repository has migrated every route to oRPC.",
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingDecorator: `Controller method '{{name}}' must be decorated with {{expected}}. ${DOCS_REFERENCE}`,
      missingReturn: `Controller method '{{name}}' must only return the result of calling {{expected}}. ${DOCS_REFERENCE}`,
      decoratorNotFromPackage: "Decorator `{{decorator}}` must be imported from `{{source}}`",
      callNotFromPackage: "Method `{{handlerFunction}}` must be imported from `{{source}}`",
      conflictingDecorators:
        "Controller method '{{name}}' must use either `@TsRestHandler()` or `@Implement()`, not both.",
      tsRestHandlerForbidden:
        "Controller method '{{name}}' must implement its route with oRPC's `@Implement()` and `implement(…).handler(…)` from `@orpc/nest`; this repository no longer accepts ts-rest handlers.",
    },
  },
  create(context) {
    const [rawOptions] = context.options;
    const options: Options = (rawOptions ?? {}) as Options;
    const allowedStyles: readonly HandlerStyle[] =
      options.forbidTsRestHandler === true ? [ORPC] : [TS_REST, ORPC];
    /** Names imported from each style's package, keyed by the package specifier. */
    const correctlyImported = new Map<string, Set<string>>();

    function isImportedFrom(name: string, source: string): boolean {
      return correctlyImported.get(source)?.has(name) === true;
    }

    function report(node: ESTree.Node, messageId: MessageId, data: Record<string, string>): void {
      context.report({ node, messageId, data });
    }

    function validateHandlerImport(handlerCall: ESTree.Expression, style: HandlerStyle): void {
      if (!isImportedFrom(style.handlerFunction, style.source)) {
        report(handlerCall, "callNotFromPackage", {
          handlerFunction: style.handlerFunction,
          source: style.source,
        });
      }
    }

    function validateStyle(
      node: ESTree.MethodDefinition,
      symbolName: string,
      style: HandlerStyle,
    ): void {
      if (!isImportedFrom(style.decorator, style.source)) {
        for (const decorator of decoratorCalls(node, style.decorator)) {
          report(decorator, "decoratorNotFromPackage", {
            decorator: style.decorator,
            source: style.source,
          });
        }
      }

      const returned = soleReturnArgument(node);
      const handlerCall = returned === undefined ? undefined : style.handlerCall(returned);
      if (handlerCall === undefined) {
        report(node, "missingReturn", { name: symbolName, expected: style.expectedReturn });
        return;
      }

      validateHandlerImport(handlerCall, style);
    }

    function validateUndecorated(node: ESTree.MethodDefinition, symbolName: string): void {
      report(node, "missingDecorator", {
        name: symbolName,
        expected: describeAlternatives(
          allowedStyles,
          (style) => `\`@${style.decorator}()\` from \`${style.source}\``,
        ),
      });

      const returned = soleReturnArgument(node);
      for (const style of allowedStyles) {
        const handlerCall = returned === undefined ? undefined : style.handlerCall(returned);
        if (handlerCall !== undefined) {
          validateHandlerImport(handlerCall, style);
          return;
        }
      }

      report(node, "missingReturn", {
        name: symbolName,
        expected: describeAlternatives(allowedStyles, (style) => style.expectedReturn),
      });
    }

    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (source !== TS_REST.source && source !== ORPC.source) {
          return;
        }

        const names = correctlyImported.get(source) ?? new Set<string>();
        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportSpecifier" && specifier.imported.type === "Identifier") {
            names.add(specifier.imported.name);
          }
        }
        correctlyImported.set(source, names);
      },

      MethodDefinition(node) {
        const symbolName = node.key.type === "Identifier" ? node.key.name : "<unknown>";
        if (
          node.kind === "constructor" ||
          node.accessibility === "private" ||
          (node.key.type === "Identifier" && node.key.name === "constructor")
        ) {
          return;
        }

        const usesTsRest = decoratorCalls(node, TS_REST.decorator).length > 0;
        const usesOrpc = decoratorCalls(node, ORPC.decorator).length > 0;

        if (usesTsRest && usesOrpc) {
          report(node, "conflictingDecorators", { name: symbolName });
          return;
        }

        if (usesTsRest && options.forbidTsRestHandler === true) {
          report(node, "tsRestHandlerForbidden", { name: symbolName });
          return;
        }

        if (usesTsRest) {
          validateStyle(node, symbolName, TS_REST);
        } else if (usesOrpc) {
          validateStyle(node, symbolName, ORPC);
        } else {
          validateUndecorated(node, symbolName);
        }
      },
    };
  },
});

export default rule;
