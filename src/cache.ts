import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface Entry<T> {
  fetchedAt: number;
  data: T;
}

export interface CacheResult<T> {
  data: T;
  fetchedAt: string;
  stale: boolean;
  warning?: string;
}

export function defaultCacheDir(): string {
  return join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "digikey-mcp");
}

/**
 * Saves API results as JSON files so they survive server restarts. A saved
 * copy is used for 7 days. If a new download fails, the old copy is returned
 * with a warning instead of failing.
 */
export class JsonFileCache {
  constructor(
    private readonly dir: string,
    private readonly now: () => number = Date.now,
  ) {}

  async get<T>(
    key: string,
    load: () => Promise<T>,
    options: { refresh?: boolean } = {},
  ): Promise<CacheResult<T>> {
    const saved = await this.read<T>(key);
    if (saved && !options.refresh && this.now() - saved.fetchedAt < MAX_AGE_MS) {
      return { data: saved.data, fetchedAt: new Date(saved.fetchedAt).toISOString(), stale: false };
    }
    let data: T;
    try {
      data = await load();
    } catch (error) {
      if (!saved) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      return {
        data: saved.data,
        fetchedAt: new Date(saved.fetchedAt).toISOString(),
        stale: true,
        warning: `Download failed, using saved copy. ${reason}`,
      };
    }
    const entry: Entry<T> = { fetchedAt: this.now(), data };
    await this.write(key, entry);
    return { data, fetchedAt: new Date(entry.fetchedAt).toISOString(), stale: false };
  }

  private async read<T>(key: string): Promise<Entry<T> | undefined> {
    let text: string;
    try {
      text = await readFile(this.path(key), "utf8");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
      throw error;
    }
    try {
      const entry: Entry<T> = JSON.parse(text);
      return typeof entry.fetchedAt === "number" ? entry : undefined;
    } catch {
      // A corrupt file is treated as missing and replaced by the next download.
      return undefined;
    }
  }

  private async write<T>(key: string, entry: Entry<T>): Promise<void> {
    try {
      await mkdir(this.dir, { recursive: true });
      await writeFile(this.path(key), JSON.stringify(entry));
    } catch (error) {
      // The data is still good. Report the problem on stderr (stdout is the MCP channel).
      console.error(`digikey-mcp: could not save cache file ${this.path(key)}:`, error);
    }
  }

  private path(key: string): string {
    return join(this.dir, `${key}.json`);
  }
}
