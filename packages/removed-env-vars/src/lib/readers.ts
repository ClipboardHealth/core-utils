import ts from "typescript";

export interface Reader {
  name: string;
  filePath: string;
  line: number;
  text: string;
}

/**
 * Finds lines that read one of `names` directly: `process.env.NAME`, `process.env["NAME"]`, a
 * destructured `process.env`, or the name as a whole string literal, which covers schema keys and
 * helpers such as `getEnv("NAME")`.
 */
export function findLiteralReaders(params: {
  filePath: string;
  names: ReadonlySet<string>;
  source: string;
}): Reader[] {
  const { filePath, names, source } = params;
  const candidates = [...names].filter((name) => source.includes(name));
  if (candidates.length === 0) {
    return [];
  }

  const readers: Reader[] = [];
  const lines = source.split("\n");
  for (const [index, lineText] of lines.entries()) {
    for (const name of candidates) {
      if (lineText.includes(name) && !isComment(lineText) && readsName({ lineText, name })) {
        readers.push({ name, filePath, line: index + 1, text: lineText.trim() });
      }
    }
  }

  return readers;
}

function isComment(lineText: string): boolean {
  return /^\s*(?:\/\/|\/\*|\*)/.test(lineText);
}

function readsName(params: { lineText: string; name: string }): boolean {
  const { lineText, name } = params;
  const escaped = name.replaceAll(/[$.*+?^()[\]{}|\\]/g, String.raw`\$&`);
  const patterns = [
    new RegExp(String.raw`(["'\`])${escaped}\1`),
    new RegExp(String.raw`process\.env\??\.${escaped}(?![\w$])`),
    new RegExp(String.raw`\{[^}]*(?<![\w$])${escaped}(?![\w$])[^}]*\}\s*=\s*process\.env`),
  ];
  return patterns.some((pattern) => pattern.test(lineText));
}

/**
 * Finds `@clipboard-health/config` values whose derived variable name is one of `names`. The
 * library reads `{ myApi: { baseURL: { defaultValue, description } } }` from `MY_API_BASE_URL`, so
 * the name never appears in source. The root of the configuration object isn't known, so every
 * suffix of a value's property path is compared.
 */
export function findConfigPathReaders(params: {
  filePath: string;
  names: ReadonlySet<string>;
  source: string;
}): Reader[] {
  const { filePath, names, source } = params;
  if (!source.includes("defaultValue")) {
    return [];
  }

  const namesByKey = new Map([...names].map((name) => [toComparisonKey(name), name]));
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    /\.[cm]?jsx?$/.test(filePath) ? ts.ScriptKind.JSX : ts.ScriptKind.TSX,
  );
  const readers: Reader[] = [];

  function visit(node: ts.Node, path: readonly string[]): void {
    if (ts.isPropertyAssignment(node)) {
      const key = getPropertyName(node.name);
      const childPath = key === undefined ? [] : [...path, key];
      if (ts.isObjectLiteralExpression(node.initializer) && isConfigValue(node.initializer)) {
        const name = matchPath({ namesByKey, path: childPath });
        if (name !== undefined) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          readers.push({
            name,
            filePath,
            line: line + 1,
            text: `${childPath.join(".")} (read from ${name} by @clipboard-health/config)`,
          });
        }
      }

      ts.forEachChild(node, (child) => {
        visit(child, childPath);
      });
      return;
    }

    if (ts.isObjectLiteralExpression(node)) {
      ts.forEachChild(node, (child) => {
        visit(child, path);
      });
      return;
    }

    ts.forEachChild(node, (child) => {
      visit(child, []);
    });
  }

  visit(sourceFile, []);
  return readers;
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

function matchPath(params: {
  namesByKey: ReadonlyMap<string, string>;
  path: readonly string[];
}): string | undefined {
  const { namesByKey, path } = params;
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
