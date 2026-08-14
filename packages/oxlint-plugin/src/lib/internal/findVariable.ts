import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

type Identifier = ESTree.BindingIdentifier | ESTree.IdentifierName | ESTree.IdentifierReference;

export function findVariable(sourceCode: SourceCode, identifier: Identifier): Variable | undefined {
  let scope: Scope | null = sourceCode.getScope(identifier);

  while (scope !== null) {
    const variable = scope.set.get(identifier.name);
    if (variable !== undefined) {
      return variable;
    }

    scope = scope.upper;
  }

  return undefined;
}
