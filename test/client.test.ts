import { describe, expect, it, vi } from "vitest";
import { DigiKeyApiError, DigiKeyClient } from "../src/client.js";

function fakeTokens() {
  return { getToken: vi.fn(async () => "tok"), invalidate: vi.fn() };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("DigiKeyClient", () => {
  it("sends a JSON body on POST", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => json({}));
    const client = new DigiKeyClient("id", fakeTokens(), fetchFn);

    await client.post("/products/v4/search/keyword", { Keywords: "x" });

    const [, init] = fetchFn.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe('{"Keywords":"x"}');
    expect(init?.headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("uses the problem-details detail as the error message", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      json({ title: "Not Found", status: 404, detail: "Requested Product abc Not Found" }, 404, {
        "X-RateLimit-Remaining": "996",
      }),
    );
    const client = new DigiKeyClient("id", fakeTokens(), fetchFn);

    const error = await client.get("/x").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DigiKeyApiError);
    expect(error).toMatchObject({ status: 404, rateLimitRemaining: "996" });
    expect(String(error)).toContain("Requested Product abc Not Found");
  });

  it("reads the older error shape and Retry-After on 429", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      json(
        { StatusCode: 429, ErrorMessage: "BurstLimit exceeded", ErrorDetails: "Please try again" },
        429,
        { "Retry-After": "30" },
      ),
    );
    const client = new DigiKeyClient("id", fakeTokens(), fetchFn);

    const error = await client.get("/x").catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 429, retryAfter: "30" });
    expect(String(error)).toContain("BurstLimit exceeded");
    expect(String(error)).toContain("retry after 30s");
  });

  it("gets a new token and retries once on 401", async () => {
    const tokens = fakeTokens();
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(json({ ok: true }));
    const client = new DigiKeyClient("id", tokens, fetchFn);

    expect(await client.get("/x")).toEqual({ ok: true });
    expect(tokens.invalidate).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("fails when the retry after 401 also fails", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response("", { status: 401 }));
    const client = new DigiKeyClient("id", fakeTokens(), fetchFn);

    await expect(client.get("/x")).rejects.toMatchObject({ status: 401 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
