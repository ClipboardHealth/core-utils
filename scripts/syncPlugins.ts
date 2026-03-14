import { execFileSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

type ComponentType = "agents" | "commands" | "hooks" | "skills";

interface Component {
  type: ComponentType;
  name: string;
}

interface SyncComponent {
  source: Component;
  /** Repo-relative path to the source file/directory. Overrides the computed path. */
  sourcePath?: string;
  /** Defaults to source, with commands -> skills type mapping */
  destination?: Partial<Component>;
}

interface RepoConfig {
  repo: string;
  ref?: string;
  pluginsPath?: string;
  plugins: Array<{
    name: string;
    components: SyncComponent[];
  }>;
}

const SYNC_CONFIG: RepoConfig[] = [
  {
    repo: "https://github.com/anthropics/claude-plugins-official.git",
    pluginsPath: "plugins",
    plugins: [
      {
        name: "commit-commands",
        components: [{ source: { type: "commands", name: "commit-push-pr" } }],
      },
    ],
  },
  {
    repo: "https://github.com/Piebald-AI/claude-code-system-prompts.git",
    plugins: [
      {
        name: "claude-code-system-prompts",
        components: [
          {
            source: { type: "skills", name: "simplify" },
            sourcePath: "system-prompts/skill-simplify.md",
          },
        ],
      },
    ],
  },
];

const PLUGIN_ROOT = path.resolve(__dirname, "../plugins/core");

function extractRepoName(repoUrl: string): string {
  return (
    repoUrl
      .replace(/\.git$/, "")
      .split("/")
      .pop() ?? "repo"
  );
}

function copyPath(source: string, destination: string, isDirectory: boolean): void {
  mkdirSync(path.dirname(destination), { recursive: true });
  rmSync(destination, { recursive: true, force: true });
  cpSync(source, destination, { recursive: isDirectory });
}

interface SourceInfo {
  path: string;
  isFile: boolean;
}

function findSource(basePath: string, name: string): SourceInfo | undefined {
  const dirPath = path.join(basePath, name);
  if (existsSync(dirPath) && lstatSync(dirPath).isDirectory()) {
    return { path: dirPath, isFile: false };
  }

  const filePath = path.join(basePath, `${name}.md`);
  if (existsSync(filePath)) {
    return { path: filePath, isFile: true };
  }

  return undefined;
}

function syncComponent(source: SourceInfo, destType: ComponentType, componentName: string): void {
  if (source.isFile) {
    if (destType === "skills") {
      const skillDir = path.join(PLUGIN_ROOT, destType, componentName);
      mkdirSync(skillDir, { recursive: true });
      copyPath(source.path, path.join(skillDir, "SKILL.md"), false);
    } else {
      copyPath(source.path, path.join(PLUGIN_ROOT, destType, `${componentName}.md`), false);
    }
  } else {
    copyPath(source.path, path.join(PLUGIN_ROOT, destType, componentName), true);
  }
}

function syncRepo(config: RepoConfig): void {
  const repoName = extractRepoName(config.repo);
  const tempDir = path.join(PLUGIN_ROOT, `.tmp-plugin-sync-${repoName}`);
  const pluginsPath = config.pluginsPath ?? "plugins";

  console.log(`\nSyncing from: ${config.repo}${config.ref ? ` (${config.ref})` : ""}`);

  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }

  const cloneArgs = ["clone", "--depth", "1"];
  if (config.ref) {
    cloneArgs.push("--branch", config.ref);
  }
  cloneArgs.push(config.repo, tempDir);

  try {
    execFileSync("git", cloneArgs, { stdio: "inherit" });

    for (const plugin of config.plugins) {
      for (const { source, destination, sourcePath } of plugin.components) {
        const destType = destination?.type ?? (source.type === "commands" ? "skills" : source.type);
        const destName = destination?.name ?? source.name;

        let sourceInfo: SourceInfo | undefined;
        if (sourcePath) {
          const fullPath = path.join(tempDir, sourcePath);
          if (existsSync(fullPath)) {
            sourceInfo = { path: fullPath, isFile: lstatSync(fullPath).isFile() };
          }
        } else {
          const basePath = path.join(tempDir, pluginsPath, plugin.name, source.type);
          sourceInfo = findSource(basePath, source.name);
        }

        if (!sourceInfo) {
          const location =
            sourcePath ?? `${pluginsPath}/${plugin.name}/${source.type}/${source.name}`;
          console.warn(`  Warning: Source not found: ${location}`);
          continue;
        }

        syncComponent(sourceInfo, destType, destName);
        console.log(
          `  Synced: ${plugin.name}/${source.type}/${source.name} -> ${destType}/${destName}`,
        );
      }
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function syncPlugins(): void {
  console.log("Syncing plugins from external repositories...");

  for (const config of SYNC_CONFIG) {
    syncRepo(config);
  }

  console.log("\nSync complete!");
}

syncPlugins();
