/** Tiny fetch helper with timeout + JSON handling for integration clients. */

export class IntegrationError extends Error {
  constructor(
    public integration: string,
    message: string,
    public status?: number,
  ) {
    super(`[${integration}] ${message}`);
    this.name = "IntegrationError";
  }
}

export class NotConfiguredError extends IntegrationError {
  constructor(integration: string) {
    super(integration, "not configured — add keys to .env.local");
    this.name = "NotConfiguredError";
  }
}

export async function httpJson<T = unknown>(
  integration: string,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 20000, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...rest, signal: ctrl.signal });
    const text = await res.text();
    const json = text ? safeParse(text) : null;
    if (!res.ok) {
      const detail = (json as { message?: string })?.message || text.slice(0, 300);
      throw new IntegrationError(integration, detail || res.statusText, res.status);
    }
    return json as T;
  } catch (err) {
    if (err instanceof IntegrationError) throw err;
    throw new IntegrationError(integration, (err as Error).message);
  } finally {
    clearTimeout(timer);
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
