import type { AccessTokenSource } from "./auth.js";

const API_BASE = "https://api.digikey.com";

const LOCALE_HEADERS = {
  "X-DIGIKEY-Locale-Site": "US",
  "X-DIGIKEY-Locale-Language": "en",
  "X-DIGIKEY-Locale-Currency": "USD",
};

export class DigiKeyApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfter: string | null,
    readonly rateLimitRemaining: string | null,
  ) {
    super(message);
    this.name = "DigiKeyApiError";
  }
}

export class DigiKeyClient {
  constructor(
    private readonly clientId: string,
    private readonly tokens: AccessTokenSource,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  get(path: string): Promise<unknown> {
    return this.request("GET", path);
  }

  post(path: string, body: unknown): Promise<unknown> {
    return this.request("POST", path, body);
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    let response = await this.send(method, path, body);
    if (response.status === 401) {
      // The cached token may have been revoked early. Try once with a new one.
      this.tokens.invalidate();
      response = await this.send(method, path, body);
    }
    const text = await response.text();
    if (!response.ok) {
      throw toApiError(response, text);
    }
    return text ? JSON.parse(text) : {};
  }

  private async send(method: string, path: string, body: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await this.tokens.getToken()}`,
      "X-DIGIKEY-Client-Id": this.clientId,
      Accept: "application/json",
      ...LOCALE_HEADERS,
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    return this.fetchFn(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
}

// DigiKey returns two error shapes: RFC 7807 problem details (detail/title)
// and an older shape (ErrorMessage/ErrorDetails) used for rate limit errors.
function toApiError(response: Response, text: string): DigiKeyApiError {
  let reason = text || response.statusText;
  try {
    const body = JSON.parse(text);
    reason =
      [body.detail ?? body.title, body.ErrorMessage, body.ErrorDetails].filter(Boolean).join(": ") ||
      reason;
  } catch {
    // Body is not JSON. Keep the raw text as the reason.
  }
  const retryAfter = response.headers.get("Retry-After");
  const rateLimitRemaining = response.headers.get("X-RateLimit-Remaining");
  let message = `DigiKey API error ${response.status}: ${reason}`;
  if (retryAfter) message += ` (retry after ${retryAfter}s)`;
  if (rateLimitRemaining) message += ` [daily requests remaining: ${rateLimitRemaining}]`;
  return new DigiKeyApiError(response.status, message, retryAfter, rateLimitRemaining);
}
