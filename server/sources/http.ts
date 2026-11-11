export const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) hunt-job-agent/0.1 (+personal job search)";

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
    body: string,
    public retryAfter?: number,
  ) {
    super(`HTTP ${status} for ${url}: ${body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140)}`);
  }
}

/** fetchJson with up to 2 retries on 429 / 503 (rate limits), honouring Retry-After when it is short. */
export async function fetchJson<T = any>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchJsonOnce<T>(url, init);
    } catch (e) {
      if (!(e instanceof HttpError) || ![429, 503].includes(e.status) || attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, (e.retryAfter ?? 3 + attempt * 5) * 1000));
    }
  }
}

async function fetchJsonOnce<T = any>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 20_000);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "application/json", ...(init.headers || {}) },
    });
    const text = await res.text();
    if (!res.ok) {
      const ra = Number(res.headers.get("retry-after"));
      throw new HttpError(res.status, url, text, Number.isFinite(ra) && ra > 0 && ra <= 20 ? ra : undefined);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Bad JSON from ${url}: ${text.slice(0, 120)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Run async work with bounded concurrency, collecting results in order. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
