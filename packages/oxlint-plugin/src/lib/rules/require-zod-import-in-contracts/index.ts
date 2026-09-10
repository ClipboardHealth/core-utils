/**
 * @fileoverview Require *.contract.ts files to reference "zod" in their own module scope
 * to prevent a TypeScript declaration-emit bug that silently collapses inferred zod types
 * to `any` in downstream consumers.
 */
import { defineRule, type ESTree } from "@oxlint/plugins";

const ZOD_MODULE = "zod";

function referencesZod(node: ESTree.Program["body"][number]): boolean {
  if (node.type === "ImportDeclaration" || node.type === "ExportAllDeclaration") {
    return node.source.value === ZOD_MODULE;
  }

  if (node.type === "ExportNamedDeclaration") {
    return node.source?.value === ZOD_MODULE;
  }

  return false;
}

const rule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require *.contract.ts files to reference 'zod' in their own module scope so TypeScript emits clean declaration types for downstream consumers",
      url: "https://github.com/ClipboardHealth/core-utils/tree/main/packages/eslint-plugin/src/lib/rules/require-zod-import-in-contracts",
    },
    schema: [],
    messages: {
      missingZodReference:
        'Contract files must reference \'zod\' in their own module scope. Without a top-level zod import, TypeScript\'s declaration emit can leak `import("node_modules/zod/...")` paths into the published .d.ts, silently collapsing inferred response types to `any` for downstream consumers. Add `import { z } from "zod"` if you use `z` directly, or `export { z } from "zod"` if you only compose schemas from sibling files (this satisfies both `noUnusedLocals` and the declaration emitter).',
    },
  },
  create(context) {
    return {
      Program(node) {
        if (node.body.some(referencesZod)) {
          return;
        }

        context.report({
          node,
          messageId: "missingZodReference",
        });
      },
    };
  },
});

export default rule;
