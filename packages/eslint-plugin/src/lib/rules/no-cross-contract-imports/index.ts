/**
 * @fileoverview Forbid contract packages from importing other contract packages.
 * Cross-contract dependencies pin one contract into another's dependencies,
 * vendoring duplicate copies into every consumer and risking dependency cycles.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";

import { createRule } from "../../createRule";

const CONTRACT_PACKAGE_PATTERN = /^@clipboard-health\/(?:contract-|api-contract-|flag-)/;
const SHARED_CONTRACT_PACKAGE = "@clipboard-health/contract-core";

const packageNameCache = new Map<string, string | undefined>();

/**
 * Walks up from `directory` to the nearest package.json that declares a `name`.
 * Skips nameless manifests (e.g. `{"type":"module"}` build-output markers).
 */
function nearestPackageName(directory: string): string | undefined {
  if (packageNameCache.has(directory)) {
    return packageNameCache.get(directory);
  }

  let name: string | undefined;
  const manifestPath = path.join(directory, "package.json");
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- resolves the linted file's own package.json
    const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (
      typeof manifest === "object" &&
      manifest !== null &&
      "name" in manifest &&
      typeof manifest.name === "string"
    ) {
      name = manifest.name;
    }
  } catch {
    // No package.json in this directory; keep walking up.
  }

  if (name === undefined) {
    const parent = path.dirname(directory);
    name = parent === directory ? undefined : nearestPackageName(parent);
  }

  packageNameCache.set(directory, name);
  return name;
}

function isBannedSpecifier(specifier: string): boolean {
  return (
    CONTRACT_PACKAGE_PATTERN.test(specifier) &&
    specifier !== SHARED_CONTRACT_PACKAGE &&
    !specifier.startsWith(`${SHARED_CONTRACT_PACKAGE}/`)
  );
}

const rule = createRule({
  name: "no-cross-contract-imports",
  defaultOptions: [],
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid contract packages from importing other contract packages; contracts own the shape of their inputs and outputs",
    },
    schema: [],
    messages: {
      noCrossContractImport:
        "Contract packages must not depend on '{{specifier}}'. Cross-contract imports (including type-only imports and re-exports) pin another contract into this package's dependencies, vendoring duplicate copies into every consumer and risking dependency cycles. Import shared primitives from @clipboard-health/contract-core, or duplicate the schema locally — type-checking and response validation catch drift.",
    },
  },

  create(context) {
    // context.filename requires ESLint >=8.40; fall back for older 8.x hosts.
    const filename = (context as Partial<typeof context>).filename ?? context.getFilename();
    const packageName = nearestPackageName(path.dirname(filename));
    if (packageName === undefined || !CONTRACT_PACKAGE_PATTERN.test(packageName)) {
      return {};
    }

    function checkSpecifier(node: TSESTree.Node, specifier: string): void {
      const isSelfImport = specifier === packageName || specifier.startsWith(`${packageName}/`);
      if (!isSelfImport && isBannedSpecifier(specifier)) {
        context.report({
          node,
          messageId: "noCrossContractImport",
          data: { specifier },
        });
      }
    }

    return {
      ImportDeclaration(node) {
        checkSpecifier(node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source) {
          checkSpecifier(node, node.source.value);
        }
      },
      ExportAllDeclaration(node) {
        checkSpecifier(node, node.source.value);
      },
      ImportExpression(node) {
        if (node.source.type === AST_NODE_TYPES.Literal && typeof node.source.value === "string") {
          checkSpecifier(node, node.source.value);
        }
      },
      CallExpression(node) {
        const [argument] = node.arguments;
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === "require" &&
          argument?.type === AST_NODE_TYPES.Literal &&
          typeof argument.value === "string"
        ) {
          checkSpecifier(node, argument.value);
        }
      },
      TSImportEqualsDeclaration(node) {
        if (
          node.moduleReference.type === AST_NODE_TYPES.TSExternalModuleReference &&
          node.moduleReference.expression.type === AST_NODE_TYPES.Literal &&
          typeof node.moduleReference.expression.value === "string"
        ) {
          checkSpecifier(node, node.moduleReference.expression.value);
        }
      },
    };
  },
});

export default rule;
