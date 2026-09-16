import type { ESTree, Fix, Fixer, Scope, SourceCode, Variable } from "@oxlint/plugins";

export interface NullishCheck {
  node: ESTree.UnaryExpression;
  callee: ESTree.CallExpression["callee"];
  variable: Variable;
  declaration: ESTree.ImportDeclaration;
}

interface FixRequest {
  sourceCode: SourceCode;
  fixer: Fixer;
  checks: NullishCheck[];
  preferred: string;
  isolateFix: boolean;
}

export function fixPositiveNullishChecks(request: FixRequest): Fix[] {
  const { sourceCode, fixer, checks, preferred, isolateFix } = request;
  const fixes: Fix[] = [];
  const imports = sourceCode.ast.body.filter(
    (node): node is ESTree.ImportDeclaration =>
      node.type === "ImportDeclaration" &&
      node.source.value === "@clipboard-health/util-ts" &&
      node.importKind !== "type",
  );
  const candidates = imports.flatMap((declaration) =>
    sourceCode
      .getDeclaredVariables(declaration)
      .filter((variable) =>
        variable.defs.some(
          ({ node }) =>
            node.type === "ImportSpecifier" &&
            node.importKind !== "type" &&
            (node.imported.type === "Identifier" ? node.imported.name : node.imported.value) ===
              preferred,
        ),
      ),
  );
  const names = new Set(
    sourceCode.scopeManager.scopes.flatMap((scope) => [
      ...scope.variables.map(({ name }) => name),
      ...scope.references.map(({ identifier }) => identifier.name),
      ...scope.through.map(({ identifier }) => identifier.name),
    ]),
  );
  let freshName = preferred;
  for (let suffix = 2; names.has(freshName); suffix++) {
    freshName = `${preferred}${suffix}`;
  }

  let needsImport = false;
  for (const { node, callee } of checks) {
    // Keep comments and parentheses, and avoid joining `return!check()` into one token.
    const [start] = node.range;
    const separator = bangReplacement({ sourceCode, node });
    fixes.push(fixer.replaceTextRange([start, start + 1], separator));
    if (callee.type === "MemberExpression") {
      const text = callee.computed
        ? `${sourceCode.getText(callee.property)[0]}${preferred}${sourceCode.getText(callee.property)[0]}`
        : preferred;
      fixes.push(fixer.replaceText(callee.property, text));
    } else {
      const candidate = candidates.find((variable) => isVisible({ sourceCode, callee, variable }));
      needsImport ||= candidate === undefined;
      fixes.push(fixer.replaceText(callee, candidate?.name ?? freshName));
    }
  }

  const namedChecks = checks.filter(({ callee }) => callee.type === "Identifier");
  const replacedReferences = new Set<ESTree.Node>(namedChecks.map(({ callee }) => callee));
  const removable = new Set<ESTree.ImportDeclarationSpecifier>(
    namedChecks
      .filter(({ variable }) =>
        variable.references.every(({ identifier }) => replacedReferences.has(identifier)),
      )
      .flatMap(({ variable }) =>
        variable.defs.flatMap(({ node }) => (node.type === "ImportSpecifier" ? [node] : [])),
      ),
  );

  if (needsImport) {
    fixes.push(...addImport({ sourceCode, fixer, namedChecks, removable, preferred, freshName }));
  }

  fixes.push(...removeImports({ sourceCode, fixer, imports, removable }));
  if (needsImport || removable.size > 0 || isolateFix) {
    // Serialize import changes with the opposite rule and other fixes that reuse these bindings.
    fixes.push(
      fixer.insertTextBefore(sourceCode.ast, ""),
      fixer.insertTextAfter(sourceCode.ast, ""),
    );
  }

  return fixes;
}

interface BangReplacementRequest {
  sourceCode: SourceCode;
  node: ESTree.UnaryExpression;
}

function bangReplacement({ sourceCode, node }: BangReplacementRequest): string {
  const statement = node.parent;
  const parentType = statement?.parent?.type;
  if (
    statement?.type === "ExpressionStatement" &&
    statement.range[0] === node.range[0] &&
    (parentType === "Program" ||
      parentType === "BlockStatement" ||
      parentType === "SwitchCase" ||
      parentType === "StaticBlock" ||
      parentType === "TSModuleBlock") &&
    sourceCode.getFirstTokens(node, 2)[1]?.value === "("
  ) {
    return ";";
  }

  return /[\w$]/u.test(sourceCode.text[node.range[0] - 1] ?? "") ? " " : "";
}

interface VisibleRequest {
  sourceCode: SourceCode;
  callee: ESTree.CallExpression["callee"];
  variable: Variable;
}

function isVisible({ sourceCode, callee, variable }: VisibleRequest): boolean {
  let scope: Scope | null = sourceCode.getScope(callee);
  while (scope !== null) {
    const binding = scope.set.get(variable.name);
    if (binding !== undefined) {
      return binding === variable;
    }

    scope = scope.upper;
  }

  return false;
}

interface AddImportRequest {
  sourceCode: SourceCode;
  fixer: Fixer;
  namedChecks: NullishCheck[];
  removable: Set<ESTree.ImportDeclarationSpecifier>;
  preferred: string;
  freshName: string;
}

function addImport(request: AddImportRequest): Fix[] {
  const { sourceCode, fixer, namedChecks, removable, preferred, freshName } = request;
  const text = freshName === preferred ? preferred : `${preferred} as ${freshName}`;
  const replacement = removable.values().next().value;
  if (replacement?.type === "ImportSpecifier") {
    removable.delete(replacement);
    if (sourceCode.getCommentsInside(replacement).length === 0) {
      return [fixer.replaceText(replacement, text)];
    }

    const importedText = sourceCode.getText(replacement.imported);
    const imported =
      replacement.imported.type === "Identifier"
        ? preferred
        : `${importedText[0]}${preferred}${importedText[0]}`;
    return [
      fixer.replaceText(replacement.imported, imported),
      fixer.replaceText(replacement.local, freshName),
    ];
  }

  const specifier = namedChecks[0]?.declaration.specifiers.find(
    (node) => node.type === "ImportSpecifier",
  );
  return specifier === undefined ? [] : [fixer.insertTextAfter(specifier, `, ${text}`)];
}

interface RemoveImportsRequest {
  sourceCode: SourceCode;
  fixer: Fixer;
  imports: ESTree.ImportDeclaration[];
  removable: Set<ESTree.ImportDeclarationSpecifier>;
}

function removeImports(request: RemoveImportsRequest): Fix[] {
  const { sourceCode, fixer, imports, removable } = request;
  const removedTokens = new Set<ESTree.Token>();
  const fixes: Fix[] = [];
  for (const declaration of imports) {
    if (
      declaration.specifiers.length > 0 &&
      declaration.specifiers.every((node) => removable.has(node))
    ) {
      const [first, ...rest] = sourceCode.getTokens(declaration);
      if (first !== undefined) {
        // The import may separate two statements that would otherwise join through ASI.
        fixes.push(fixer.replaceText(first, ";"));
      }

      for (const token of rest) {
        removedTokens.add(token);
      }
    } else {
      for (const specifier of declaration.specifiers) {
        if (!removable.has(specifier)) {
          continue;
        }

        for (const token of sourceCode.getTokens(specifier)) {
          removedTokens.add(token);
        }

        const after = sourceCode.getTokenAfter(specifier);
        const before = sourceCode.getTokenBefore(specifier);
        const comma = after?.value === "," ? after : before?.value === "," ? before : undefined;
        if (comma !== undefined) {
          removedTokens.add(comma);
        }
      }
    }
  }

  return [...fixes, ...[...removedTokens].map((token) => fixer.remove(token))];
}
