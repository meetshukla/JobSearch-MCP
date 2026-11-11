/**
 * One secret, HUNT_TOKEN, for everything. Agents send it as a bearer token; the website exchanges it
 * once for a cookie that holds a signature of it, never the token itself. Changing the token signs everyone out.
 */
const enc = new TextEncoder();

export const hasToken = () => Boolean(process.env.HUNT_TOKEN?.trim());

function sameText(a: string, b: string) {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function tokenMatches(given: string | null | undefined) {
  const t = process.env.HUNT_TOKEN?.trim();
  return Boolean(t && given && sameText(given.trim(), t));
}

export async function sessionValue() {
  const key = await crypto.subtle.importKey("raw", enc.encode(process.env.HUNT_TOKEN!.trim()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("hunt-session-v1"));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const COOKIE = "hunt_session";

export function bearer(req: Request) {
  const h = req.headers.get("authorization") || "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7) : null;
}

export function cookie(req: Request, name: string) {
  for (const part of (req.headers.get("cookie") || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export async function hasSession(req: Request) {
  const c = cookie(req, COOKIE);
  return Boolean(hasToken() && c && sameText(c, await sessionValue()));
}

/**
 * Wrong tokens per address: after 10 in 15 minutes, that address is refused until the window ends.
 * Kept in the Durable Object's memory, which is one instance for the whole app.
 */
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 10;
const failures = new Map<string, { n: number; until: number }>();
const clientIp = (req: Request) => req.headers.get("cf-connecting-ip") || "local";

export function blocked(req: Request) {
  const f = failures.get(clientIp(req));
  return Boolean(f && f.n >= MAX_FAILURES && Date.now() < f.until);
}

export function recordFailure(req: Request) {
  const ip = clientIp(req);
  const now = Date.now();
  const f = failures.get(ip);
  if (!f || now >= f.until) failures.set(ip, { n: 1, until: now + WINDOW_MS });
  else f.n++;
  if (failures.size > 10_000) failures.clear();
}

export const TOO_MANY = "Too many wrong tokens from this address. Try again in 15 minutes.";
