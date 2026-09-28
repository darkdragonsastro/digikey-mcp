const TOKEN_URL = "https://api.digikey.com/v1/oauth2/token";

// Get a new token this long before the current one expires.
const EXPIRY_MARGIN_MS = 60_000;

export interface AccessTokenSource {
  getToken(): Promise<string>;
  invalidate(): void;
}

/**
 * Gets and caches DigiKey OAuth access tokens using the client credentials
 * (2-legged) flow. DigiKey tokens last about 10 minutes and have no refresh
 * token, so a new token is requested when the cached one is near expiry.
 */
export class TokenProvider implements AccessTokenSource {
  private token: string | undefined;
  private expiresAt = 0;
  private pending: Promise<string> | undefined;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async getToken(): Promise<string> {
    if (this.token && this.now() < this.expiresAt - EXPIRY_MARGIN_MS) {
      return this.token;
    }
    this.pending ??= this.requestToken().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  invalidate(): void {
    this.token = undefined;
    this.expiresAt = 0;
  }

  private async requestToken(): Promise<string> {
    const response = await this.fetchFn(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: "client_credentials",
      }).toString(),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`DigiKey token request failed (${response.status}): ${text}`);
    }
    const body: { access_token?: string; expires_in?: number } = JSON.parse(text);
    if (!body.access_token || typeof body.expires_in !== "number") {
      throw new Error("DigiKey token response is missing access_token or expires_in");
    }
    this.token = body.access_token;
    this.expiresAt = this.now() + body.expires_in * 1000;
    return this.token;
  }
}
