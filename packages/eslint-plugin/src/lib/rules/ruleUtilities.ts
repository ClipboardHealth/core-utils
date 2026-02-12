import type { AST_NODE_TYPES, TSESTree } from "@typescript-eslint/utils";
import { visitorKeys } from "@typescript-eslint/visitor-keys";

function getChildKeys(nodeType: AST_NODE_TYPES): readonly string[] {
  return visitorKeys[nodeType] ?? [];
}

function isTSESTreeNode(value: unknown): value is TSESTree.Node {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type: unknown }).type === "string"
  );
}

/**
 * Iterates over all child nodes of a given AST node and checks whether any of them pass the given
 * check. Uses @typescript-eslint/visitor-keys to determine which properties contain child nodes,
 * ensuring we only visit actual AST children (not metadata like 'parent', 'range', 'loc').
 *
 * @returns true if the callback returns true for any child (short-circuits), false otherwise
 */
export function forAnyChildNode(
  node: TSESTree.Node,
  check: (child: TSESTree.Node) => boolean,
): boolean {
  return getChildKeys(node.type)
    .filter((key) => Object.hasOwn(node, key))
    .some((key) => {
      const child: unknown = node[key as keyof TSESTree.Node];

      if (Array.isArray(child)) {
        return child.some((element) => isTSESTreeNode(element) && check(element));
      }

      return isTSESTreeNode(child) && check(child);
    });
}
