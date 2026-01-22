import * as fs from "node:fs";
import * as path from "node:path";

const CACHE_VERSION = 1;

interface CacheMetadata {
  readonly version: number;
  readonly createdAt: string;
}

interface CacheEntry<T> {
  readonly metadata: CacheMetadata;
  readonly data: T;
}

export interface CacheKey {
  readonly username: string;
  readonly startDate: string;
  readonly endDate: string;
}

function getCacheDir(commandName: string): string {
  return path.join(process.cwd(), ".claude", "cache", commandName);
}

function getCachePath(commandName: string, key: CacheKey): string {
  const fileName = `${key.username}-${key.startDate}-${key.endDate}.json`;
  return path.join(getCacheDir(commandName), fileName);
}

export function readCache<T>(commandName: string, key: CacheKey): T | undefined {
  const cachePath = getCachePath(commandName, key);

  if (!fs.existsSync(cachePath)) {
    return undefined;
  }

  try {
    const content = fs.readFileSync(cachePath, "utf8");
    const entry = JSON.parse(content) as CacheEntry<T>;

    if (entry.metadata.version !== CACHE_VERSION) {
      fs.unlinkSync(cachePath);
      return undefined;
    }

    return entry.data;
  } catch {
    return undefined;
  }
}

export function writeCache<T>(commandName: string, key: CacheKey, data: T): void {
  const cacheDir = getCacheDir(commandName);
  fs.mkdirSync(cacheDir, { recursive: true });

  const entry: CacheEntry<T> = {
    metadata: {
      version: CACHE_VERSION,
      createdAt: new Date().toISOString(),
    },
    data,
  };

  const cachePath = getCachePath(commandName, key);
  fs.writeFileSync(cachePath, JSON.stringify(entry, null, 2));
}

export function listCacheFiles(commandName: string): string[] {
  const cacheDir = getCacheDir(commandName);

  if (!fs.existsSync(cacheDir)) {
    return [];
  }

  return fs.readdirSync(cacheDir).filter((file) => file.endsWith(".json"));
}

export function clearCache(commandName: string): void {
  const cacheDir = getCacheDir(commandName);

  if (fs.existsSync(cacheDir)) {
    fs.rmSync(cacheDir, { recursive: true });
  }
}
