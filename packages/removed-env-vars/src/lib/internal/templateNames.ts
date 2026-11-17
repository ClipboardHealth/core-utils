import { isRecord } from "./isRecord";

const NAME_LIST_KEYS = new Set(["environment", "secrets"]);

/**
 * Collects the variable names an ECS container-definition template sets through its `environment`
 * and `secrets` lists, at any depth, so base files, service files and full task definitions all
 * work.
 */
export function collectTemplateNames(json: unknown): Set<string> {
  const names = new Set<string>();
  visit(json, names);
  return names;
}

function visit(value: unknown, names: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      visit(item, names);
    }

    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (NAME_LIST_KEYS.has(key) && Array.isArray(child)) {
      for (const entry of child) {
        if (isRecord(entry) && typeof entry["name"] === "string") {
          names.add(entry["name"]);
        }
      }
    }

    visit(child, names);
  }
}
