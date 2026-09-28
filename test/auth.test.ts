import { describe, expect, it, vi } from "vitest";
import { TokenProvider } from "../src/auth.js";

function tokenResponse(token: string, expiresIn = 599) {
  return new Response(
    JSON.stringify({ access_token: token, expires_in: expiresIn, token_type: "Bearer" }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("TokenProvider", () => {
  it("reuses a cached token until it is close to expiry", async () => {
    let now = 0;
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse("t1", 600))
      .mockResolvedValueOnce(tokenResponse("t2", 600));
    const provider = new TokenProvider("id", "secret", fetchFn, () => now);

    expect(await provider.getToken()).toBe("t1");
    now = 500_000;
    expect(await provider.getToken()).toBe("t1");
    now = 550_000;
    expect(await provider.getToken()).toBe("t2");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("shares one token request between concurrent callers", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => tokenResponse("t1"));
    const provider = new TokenProvider("id", "secret", fetchFn);

    const tokens = await Promise.all([provider.getToken(), provider.getToken()]);

    expect(tokens).toEqual(["t1", "t1"]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("drops the cached token when invalidated", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse("t1"))
      .mockResolvedValueOnce(tokenResponse("t2"));
    const provider = new TokenProvider("id", "secret", fetchFn);

    await provider.getToken();
    provider.invalidate();

    expect(await provider.getToken()).toBe("t2");
  });

  it("throws with the status and body when the token request fails, then retries next time", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{"error":"invalid_client"}', { status: 401 }))
      .mockResolvedValueOnce(tokenResponse("t1"));
    const provider = new TokenProvider("id", "secret", fetchFn);

    await expect(provider.getToken()).rejects.toThrow(/401.*invalid_client/);
    expect(await provider.getToken()).toBe("t1");
  });
});
