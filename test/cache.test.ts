import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { JsonFileCache } from "../src/cache.js";

const DAY = 24 * 60 * 60 * 1000;

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "digikey-cache-"));
  let now = 1_000_000_000_000;
  const cache = new JsonFileCache(dir, () => now);
  return {
    dir,
    cache,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("JsonFileCache", () => {
  it("uses the saved copy while it is less than 7 days old, even in a new instance", async () => {
    const { dir, cache } = await setup();
    await cache.get("m", async () => ["a"]);

    const load = vi.fn(async () => ["b"]);
    const result = await new JsonFileCache(dir, () => 1_000_000_000_000 + 6 * DAY).get("m", load);

    expect(result).toMatchObject({ data: ["a"], stale: false });
    expect(load).not.toHaveBeenCalled();
  });

  it("downloads again after 7 days", async () => {
    const { cache, advance } = await setup();
    await cache.get("m", async () => ["a"]);
    advance(7 * DAY + 1);

    const result = await cache.get("m", async () => ["b"]);

    expect(result).toMatchObject({ data: ["b"], stale: false });
  });

  it("downloads again when refresh is set, and saves the new copy", async () => {
    const { dir, cache } = await setup();
    await cache.get("m", async () => ["a"]);

    await cache.get("m", async () => ["b"], { refresh: true });

    expect(JSON.parse(await readFile(join(dir, "m.json"), "utf8")).data).toEqual(["b"]);
  });

  it("downloads again when the saved file is corrupt", async () => {
    const { dir, cache } = await setup();
    await writeFile(join(dir, "m.json"), "{not json");

    const result = await cache.get("m", async () => ["b"]);

    expect(result.data).toEqual(["b"]);
  });

  it("falls back to the stale copy with a warning when the download fails", async () => {
    const { cache, advance } = await setup();
    await cache.get("m", async () => ["a"]);
    advance(8 * DAY);

    const result = await cache.get(
      "m",
      async () => {
        throw new Error("DigiKey API error 429: Daily Ratelimit exceeded");
      },
      { refresh: true },
    );

    expect(result).toMatchObject({ data: ["a"], stale: true });
    expect(result.warning).toContain("Daily Ratelimit exceeded");
  });

  it("throws when the download fails and nothing is saved", async () => {
    const { cache } = await setup();

    await expect(
      cache.get("m", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
