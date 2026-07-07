import { joinPathFragments, workspaceRoot } from "@nx/devkit";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Emits an ESM build of a package to `dist/<projectRoot>/esm` alongside the
 * default CJS build so bundlers can tree-shake it (see the `import` conditions
 * written by scripts/prepareTsgoPackage.mts).
 *
 * tsgo emits ESM without rewriting relative specifiers that lack a file
 * extension, which Node's ESM loader rejects, so this script rewrites them to
 * explicit file paths and drops a `{"type":"module"}` marker package.json
 * into `esm/`.
 */
async function main(): Promise<void> {
  const [projectRootArgument] = process.argv.slice(2);

  if (projectRootArgument === undefined) {
    throw new Error("Usage: tsx scripts/buildEsmPackage.mts <projectRoot>");
  }

  const projectRoot = joinPathFragments(projectRootArgument);

  if (!projectRoot.startsWith("packages/") || projectRoot.split("/").includes("..")) {
    throw new Error(`Invalid projectRoot: ${projectRootArgument}`);
  }

  const esmTsconfigPath = joinPathFragments(projectRoot, "tsconfig.lib.esm.json");

  if (!existsSync(joinPathFragments(workspaceRoot, esmTsconfigPath))) {
    throw new Error(`Missing ${esmTsconfigPath}`);
  }

  compile({ esmTsconfigPath });

  const esmOutputPath = joinPathFragments(workspaceRoot, "dist", projectRoot, "esm");
  rewriteRelativeSpecifiers({ directory: esmOutputPath });
  writeModuleTypeMarker({ esmOutputPath });
}

function compile({ esmTsconfigPath }: { esmTsconfigPath: string }): void {
  const result = spawnSync(
    joinPathFragments(workspaceRoot, "node_modules", ".bin", "tsgo"),
    ["--project", esmTsconfigPath],
    { cwd: workspaceRoot, stdio: "inherit" },
  );

  if (result.status !== 0) {
    throw new Error(`tsgo failed for ${esmTsconfigPath}`);
  }
}

function rewriteRelativeSpecifiers({ directory }: { directory: string }): void {
  for (const filePath of listJavaScriptFiles({ directory })) {
    const content = readFileSync(filePath, "utf8");
    const rewritten = content.replaceAll(
      /(\bfrom\s*|\bimport\s*\(?\s*)(["'])(\.\.?\/[^"']+)\2/g,
      (match, prefix: string, quote: string, specifier: string) =>
        `${prefix}${quote}${resolveSpecifier({ filePath, specifier })}${quote}`,
    );

    if (rewritten !== content) {
      writeFileSync(filePath, rewritten);
    }
  }
}

function resolveSpecifier({
  filePath,
  specifier,
}: {
  filePath: string;
  specifier: string;
}): string {
  const baseDirectory = path.dirname(filePath);

  if (existsSync(path.join(baseDirectory, `${specifier}.js`))) {
    return `${specifier}.js`;
  }

  if (existsSync(path.join(baseDirectory, specifier, "index.js"))) {
    return `${specifier}/index.js`;
  }

  throw new Error(`Unresolvable relative specifier "${specifier}" in ${filePath}`);
}

function listJavaScriptFiles({ directory }: { directory: string }): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function writeModuleTypeMarker({ esmOutputPath }: { esmOutputPath: string }): void {
  // The nearest package.json wins for both Node's module-type resolution and
  // webpack's sideEffects lookup, so the marker must re-declare sideEffects.
  writeFileSync(
    path.join(esmOutputPath, "package.json"),
    `${JSON.stringify({ type: "module", sideEffects: false }, undefined, 2)}\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
