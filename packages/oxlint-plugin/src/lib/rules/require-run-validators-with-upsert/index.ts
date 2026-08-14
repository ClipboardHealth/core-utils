/**
 * @fileoverview Rule to require runValidators: true when upsert: true is used in Mongoose operations
 */
import { defineRule, type ESTree } from "@oxlint/plugins";

const UPSERT_METHODS = new Set([
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "findByIdAndUpdate",
  "findOneAndReplace",
  "replaceOne",
]);

function hasPropertyWithValue(
  property: ESTree.ObjectPropertyKind,
  name: string,
  value: boolean,
): boolean {
  return (
    property.type === "Property" &&
    property.key.type === "Identifier" &&
    property.key.name === name &&
    property.value.type === "Literal" &&
    property.value.value === value
  );
}

function findProperty(
  objectExpression: ESTree.ObjectExpression,
  name: string,
): ESTree.ObjectProperty | undefined {
  for (const property of objectExpression.properties) {
    if (
      property.type === "Property" &&
      property.key.type === "Identifier" &&
      property.key.name === name
    ) {
      return property;
    }
  }

  return undefined;
}

function hasUpsertTrue(objectExpression: ESTree.ObjectExpression): boolean {
  return objectExpression.properties.some((property) =>
    hasPropertyWithValue(property, "upsert", true),
  );
}

function hasRunValidatorsTrue(objectExpression: ESTree.ObjectExpression): boolean {
  return objectExpression.properties.some((property) =>
    hasPropertyWithValue(property, "runValidators", true),
  );
}

function hasRunValidatorsFalse(objectExpression: ESTree.ObjectExpression): boolean {
  return objectExpression.properties.some((property) =>
    hasPropertyWithValue(property, "runValidators", false),
  );
}

function hasRunValidatorsProperty(objectExpression: ESTree.ObjectExpression): boolean {
  return objectExpression.properties.some(
    (property) =>
      property.type === "Property" &&
      property.key.type === "Identifier" &&
      property.key.name === "runValidators",
  );
}

const rule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require runValidators: true when upsert: true is used in Mongoose update operations",
      url: "https://github.com/ClipboardHealth/core-utils/tree/main/packages/eslint-plugin/src/lib/rules/require-run-validators-with-upsert",
    },
    schema: [],
    messages: {
      missingRunValidators:
        "Mongoose upsert operations must include 'runValidators: true' to ensure schema validation on inserted documents. Add 'runValidators: true' to the options object.",
      runValidatorsFalse:
        "Mongoose upsert operations should not have 'runValidators: false'. Schema validation should be enabled for upserts to ensure data integrity.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== "MemberExpression") {
          return;
        }

        const { property } = node.callee;
        if (property.type !== "Identifier") {
          return;
        }

        if (!UPSERT_METHODS.has(property.name)) {
          return;
        }

        for (const argument of node.arguments) {
          if (argument.type !== "ObjectExpression") {
            continue;
          }

          if (!hasUpsertTrue(argument)) {
            continue;
          }

          if (hasRunValidatorsTrue(argument)) {
            continue;
          }

          if (hasRunValidatorsFalse(argument)) {
            const runValidatorsProperty = findProperty(argument, "runValidators");
            if (runValidatorsProperty) {
              context.report({
                node: runValidatorsProperty,
                messageId: "runValidatorsFalse",
              });
            }
            continue;
          }

          // If runValidators is present with a non-literal value (e.g., a variable),
          // we consider it valid since the developer is explicitly setting it.
          if (hasRunValidatorsProperty(argument)) {
            continue;
          }

          const upsertProperty = findProperty(argument, "upsert");
          if (upsertProperty) {
            context.report({
              node: upsertProperty,
              messageId: "missingRunValidators",
            });
          }
        }
      },
    };
  },
});

export default rule;
