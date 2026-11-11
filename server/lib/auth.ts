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
