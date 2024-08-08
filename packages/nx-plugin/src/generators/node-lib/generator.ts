import { join } from "node:path";

import {
  formatFiles,
  generateFiles,
  getWorkspaceLayout,
  joinPathFragments,
  names,
  offsetFromRoot,
  type Tree,
  updateJson,
} from "@nx/devkit";
import { getImportPath } from "@nx/js/src/utils/get-import-path";

import type { NxPluginGeneratorSchema } from "./schema";

const ROOT_TS_CONFIG = "tsconfig.base.json";

type NormalizedSchema = NxPluginGeneratorSchema & {
  importPath: string;
  projectName: string;
  projectRoot: string;
  projectDirectory: string;
  publishConfigAccess: string;
};

function normalizeOptions(tree: Tree, options: NxPluginGeneratorSchema): NormalizedSchema {
  const name = names(options.name).fileName;
  const projectDirectory = name;
  return {
    ...options,
    publishConfigAccess: /* istanbul ignore next */ options.publishPublicly
      ? "public"
      : "restricted",
    importPath: getImportPath(tree, projectDirectory),
    projectName: name.replaceAll("/", "-"),
    projectRoot: `${getWorkspaceLayout(tree).libsDir}/${name}`,
    projectDirectory,
  };
}

function getRelativePathToRootTsConfig(targetPath: string): string {
  return `${offsetFromRoot(targetPath)}${ROOT_TS_CONFIG}`;
}

function addFiles(tree: Tree, options: NormalizedSchema) {
  generateFiles(tree, join(__dirname, "files"), options.projectRoot, {
    ...options,
    ...names(options.name),
    offsetFromRoot: offsetFromRoot(options.projectRoot),
    rootTsConfigPath: getRelativePathToRootTsConfig(options.projectRoot),
    template: "",
  });
}

function updateRootTsConfig(
  host: Tree,
  options: {
    name: string;
    importPath: string;
    projectRoot: string;
  },
) {
  updateJson<{ compilerOptions: { paths: Record<string, string[]> } }>(
    host,
    ROOT_TS_CONFIG,
    (json) => {
      const c = json.compilerOptions;
      c.paths ||= {};
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete c.paths[options.name];

      /* istanbul ignore next */
      if (c.paths[options.importPath]) {
        throw new Error(`There is already a library with import path "${options.importPath}".`);
      }

      c.paths[options.importPath] = [joinPathFragments(options.projectRoot, "./src", "index.ts")];

      return json;
    },
  );
}

export default async function generate(tree: Tree, options: NxPluginGeneratorSchema) {
  const normalizedOptions = normalizeOptions(tree, options);
  addFiles(tree, normalizedOptions);
  updateRootTsConfig(tree, normalizedOptions);
  await formatFiles(tree);
}
