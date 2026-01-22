/**
 * @fileoverview Rule to require runValidators: true when upsert: true is used in Mongoose operations
 */
import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";

import createRule from "../../createRule";

const UPSERT_METHODS = new Set([
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "findByIdAndUpdate",
  "findOneAndReplace",
  "replaceOne",
]);

const hasPropertyWithValue = (
  property: TSESTree.ObjectLiteralElement,
  name: string,
  value: boolean,
): boolean =>
  property.type === AST_NODE_TYPES.Property &&
  property.key.type === AST_NODE_TYPES.Identifier &&
  property.key.name === name &&
  property.value.type === AST_NODE_TYPES.Literal &&
  property.value.value === value;

const findProperty = (
  objectExpression: TSESTree.ObjectExpression,
  name: string,
): TSESTree.Property | undefined =>
  objectExpression.properties.find(
    (property): property is TSESTree.Property =>
      property.type === AST_NODE_TYPES.Property &&
      property.key.type === AST_NODE_TYPES.Identifier &&
      property.key.name === name,
  );

const hasUpsertTrue = (objectExpression: TSESTree.ObjectExpression): boolean =>
  objectExpression.properties.some((property) => hasPropertyWithValue(property, "upsert", true));

const hasRunValidatorsTrue = (objectExpression: TSESTree.ObjectExpression): boolean =>
  objectExpression.properties.some((property) =>
    hasPropertyWithValue(property, "runValidators", true),
  );

const hasRunValidatorsFalse = (objectExpression: TSESTree.ObjectExpression): boolean =>
  objectExpression.properties.some((property) =>
    hasPropertyWithValue(property, "runValidators", false),
  );

const hasRunValidatorsProperty = (objectExpression: TSESTree.ObjectExpression): boolean =>
  objectExpression.properties.some(
    (property) =>
      property.type === AST_NODE_TYPES.Property &&
      property.key.type === AST_NODE_TYPES.Identifier &&
      property.key.name === "runValidators",
  );

const rule = createRule({
  name: "require-run-validators-with-upsert",
  defaultOptions: [],
  meta: {
    type: "problem",
    docs: {
      description:
        "Require runValidators: true when upsert: true is used in Mongoose update operations",
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
        if (node.callee.type !== AST_NODE_TYPES.MemberExpression) {
          return;
        }

        const { property } = node.callee;
        if (property.type !== AST_NODE_TYPES.Identifier) {
          return;
        }

        const methodName = property.name;

        if (!UPSERT_METHODS.has(methodName)) {
          return;
        }

        for (const argument of node.arguments) {
          if (argument.type !== AST_NODE_TYPES.ObjectExpression) {
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
          // we consider it valid since the developer is explicitly setting it
          if (hasRunValidatorsProperty(argument)) {
            continue;
          }

          // runValidators is missing
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
