import { defineRule, type ESTree } from "@oxlint/plugins";

import { findVariable } from "./findVariable";
import { fixPositiveNullishChecks, type NullishCheck } from "./fixPositiveNullishChecks";

interface CreateRuleRequest {
  name: "prefer-is-nil" | "prefer-is-defined";
  negated: "isDefined" | "isNil";
  preferred: "isDefined" | "isNil";
}

export function createPreferPositiveNullishCheckRule(request: CreateRuleRequest) {
  const { name, negated, preferred } = request;

  return defineRule({
    meta: {
      type: "suggestion",
      docs: {
        description: `Prefer ${preferred} over negated ${negated} calls`,
        url: `https://github.com/ClipboardHealth/core-utils/tree/main/packages/oxlint-plugin/src/lib/rules/${name}`,
      },
      schema: [],
      fixable: "code",
      messages: {
        preferPositiveCheck: "Prefer {{preferred}}(value) over !{{negated}}(value).",
      },
    },
    create(context) {
      const checks: NullishCheck[] = [];

      return {
        UnaryExpression(node) {
          if (node.operator !== "!" || node.argument.type !== "CallExpression") {
            return;
          }

          const { callee } = node.argument;
          const identifier = callee.type === "Identifier" ? callee : namespaceIdentifier(callee);
          if (identifier === undefined) {
            return;
          }

          const variable = findVariable(context.sourceCode, identifier);
          const definition = variable?.defs.find(
            ({ type, node: definition, parent }) =>
              type === "ImportBinding" &&
              parent?.type === "ImportDeclaration" &&
              parent.source.value === "@clipboard-health/util-ts" &&
              parent.importKind !== "type" &&
              (callee.type === "Identifier"
                ? definition.type === "ImportSpecifier" &&
                  definition.importKind !== "type" &&
                  (definition.imported.type === "Identifier"
                    ? definition.imported.name
                    : definition.imported.value) === negated
                : definition.type === "ImportNamespaceSpecifier" &&
                  callee.type === "MemberExpression" &&
                  propertyName(callee) === negated),
          );

          if (definition?.parent?.type === "ImportDeclaration" && variable !== undefined) {
            checks.push({ node, callee, variable, declaration: definition.parent });
          }
        },
        "Program:exit"() {
          const { sourceCode } = context;
          // A batch must not change a usage whose diagnostic the linter suppresses.
          const { directives, problems } = sourceCode.getDisableDirectives();
          const hasDisableComment =
            problems.length > 0 ||
            directives.some(
              ({ type, value }) =>
                type !== "enable" &&
                (value.trim() === "" || value.split(/[,\s]+/u).includes(context.id)),
            );
          const fixableChecks = checks.filter(
            ({ node }) => node.argument.type === "CallExpression" && !node.argument.typeArguments,
          );

          for (const check of checks) {
            context.report({
              node: check.node,
              messageId: "preferPositiveCheck",
              data: { preferred, negated },
              fix: (fixer) =>
                fixableChecks.includes(check)
                  ? fixPositiveNullishChecks({
                      sourceCode,
                      fixer,
                      checks: hasDisableComment ? [check] : fixableChecks,
                      preferred,
                      isolateFix: hasDisableComment,
                    })
                  : undefined,
            });
          }
        },
      };
    },
  });
}

function namespaceIdentifier(callee: ESTree.CallExpression["callee"]) {
  return callee.type === "MemberExpression" && callee.object.type === "Identifier"
    ? callee.object
    : undefined;
}

function propertyName(node: ESTree.MemberExpression): string | undefined {
  if (!node.computed && node.property.type === "Identifier") {
    return node.property.name;
  }

  return node.computed &&
    node.property.type === "Literal" &&
    typeof node.property.value === "string"
    ? node.property.value
    : undefined;
}
