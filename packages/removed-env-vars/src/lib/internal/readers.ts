import ts from "typescript";

export interface Reader {
  name: string;
  filePath: string;
  line: number;
  text: string;
}

/**
 * Finds code that reads one of `names`. Parsing, rather than matching lines, ignores comments and
 * handles code formatters' line wrapping. A read is:
 *
 * - the name as a whole string literal: `process.env["NAME"]`, `getEnv("NAME")`;
 * - the name as a property: `process.env.NAME`, `const { NAME } = process.env`, or a schema key
 *   such as `z.object({ NAME: z.string() })`;
 * - an `@clipboard-health/config` value whose derived name is `NAME`.
 */
export function findReaders(params: {
  filePath: string;
  names: ReadonlySet<string>;
  source: string;
}): Reader[] {
  const { filePath, names, source } = params;
  const hasName = [...names].some((name) => source.includes(name));
  const hasConfig = source.includes("defaultValue");
  if (!hasName && !hasConfig) {
    return [];
  }

  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const lines = source.split("\n");
  const namesByKey = new Map([...names].map((name) => [toComparisonKey(name), name]));
  const readers = new Map<string, Reader>();

  function add(params: { name: string; node: ts.Node; text?: string }): void {
    const line =
      sourceFile.getLineAndCharacterOfPosition(params.node.getStart(sourceFile)).line + 1;
    const key = `${params.name}:${line}`;
    if (!readers.has(key)) {
      readers.set(key, {
        name: params.name,
        filePath,
        line,
        text: params.text ?? (lines[line - 1] ?? "").trim(),
      });
    }
  }

  function visit(node: ts.Node, configPath: readonly string[]): void {
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      names.has(node.text)
    ) {
      add({ name: node.text, node });
    } else if (ts.isIdentifier(node) && names.has(node.text) && isPropertyName(node)) {
      add({ name: node.text, node });
    }

    if (ts.isPropertyAssignment(node)) {
      const key = getPropertyName(node.name);
      const childPath = key === undefined ? [] : [...configPath, key];
      if (ts.isObjectLiteralExpression(node.initializer) && isConfigValue(node.initializer)) {
        const name = matchConfigPath({ namesByKey, path: childPath });
        if (name !== undefined) {
          add({
            name,
            node,
            text: `${childPath.join(".")} (read from ${name} by @clipboard-health/config)`,
          });
        }
      }

      ts.forEachChild(node, (child) => {
        visit(child, childPath);
      });
      return;
    }

    const nextPath = ts.isObjectLiteralExpression(node) ? configPath : [];
    ts.forEachChild(node, (child) => {
      visit(child, nextPath);
    });
  }

  visit(sourceFile, []);
  return [...readers.values()];
}

/** An identifier naming a property, as opposed to a local variable or function. */
function isPropertyName(node: ts.Identifier): boolean {
  const { parent } = node;
  return (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    ts.isShorthandPropertyAssignment(parent) ||
    (ts.isBindingElement(parent) && (parent.propertyName ?? parent.name) === node) ||
    ((ts.isPropertyDeclaration(parent) || ts.isPropertySignature(parent)) && parent.name === node)
  );
}

function isConfigValue(node: ts.ObjectLiteralExpression): boolean {
  const keys = new Set(
    node.properties.map((property) =>
      property.name === undefined ? undefined : getPropertyName(property.name),
    ),
  );
  return keys.has("defaultValue") && keys.has("description");
}

function getPropertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  return undefined;
}

/**
 * `@clipboard-health/config` derives a name from the full path below `createConfig`'s `config`
 * argument: `{ config: { myApi: { baseURL } } }` reads `MY_API_BASE_URL`. When the object isn't
 * written inline under `config`, its root is unknown, so every suffix of the path is compared.
 */
function matchConfigPath(params: {
  namesByKey: ReadonlyMap<string, string>;
  path: readonly string[];
}): string | undefined {
  const { namesByKey, path } = params;
  if (path[0] === "config") {
    return namesByKey.get(toComparisonKey(path.slice(1).join("")));
  }

  for (let start = 0; start < path.length; start += 1) {
    const name = namesByKey.get(toComparisonKey(path.slice(start).join("")));
    if (name !== undefined) {
      return name;
    }
  }

  return undefined;
}

function toComparisonKey(value: string): string {
  return value.replaceAll(/[^a-z\d]/gi, "").toLowerCase();
}
