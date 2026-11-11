/** HTTP routes: the MCP server, the website's API, and sign-in. */
import { Hono } from "hono";
import { handleMcp, VERSION } from "./mcp.ts";
import { callTool, toolList, ToolError } from "./tools.ts";
import { pulse } from "./lib/events.ts";
import { starterLists } from "./lib/lists.ts";
import { COOKIE, bearer, hasSession, hasToken, sessionValue, tokenMatches } from "./lib/auth.ts";
import type { Me } from "../shared/types.ts";

export type AppDeps = { wake: () => void; dev: () => boolean };

const NEEDS_TOKEN = "This Hunt has no HUNT_TOKEN yet. Set one with: npx wrangler secret put HUNT_TOKEN";

export function createApp(deps: AppDeps) {
  const app = new Hono();

  /** Agents: bearer token. Website: the session cookie. Local dev: open. */
  const authed = async (req: Request, allowCookie: boolean) =>
    deps.dev() || tokenMatches(bearer(req)) || (allowCookie && (await hasSession(req)));

  app.onError((err, c) => c.json({ error: String(err?.message || err) }, err instanceof ToolError ? 400 : 500));

  // OAuth discovery probes from MCP clients: Hunt uses a bearer token, not OAuth.
  app.all("/.well-known/*", (c) => c.json({ error: "Not found. Hunt's MCP server takes a bearer token: Authorization: Bearer <HUNT_TOKEN>." }, 404));

  app.post("/mcp", async (c) => {
    if (!deps.dev() && !hasToken()) return c.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: NEEDS_TOKEN } }, 503);
    if (!(await authed(c.req.raw, false))) {
      return c.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized. Send Authorization: Bearer <HUNT_TOKEN>." } }, 401, {
        "WWW-Authenticate": 'Bearer realm="hunt"',
      });
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
    }
    const r = await handleMcp(body, { by: "agent", wake: deps.wake });
    return r.json == null ? c.body(null, 202) : c.json(r.json as any, r.status as 200);
  });
  app.on(["GET", "DELETE"], "/mcp", (c) => c.json({ error: "Hunt's MCP server answers POST requests only (stateless, no SSE stream)." }, 405, { Allow: "POST" }));

  app.post("/api/login", async (c) => {
    if (!hasToken()) return c.json({ error: NEEDS_TOKEN }, 503);
    const { token } = await c.req.json<{ token?: string }>().catch(() => ({ token: undefined }));
    if (!tokenMatches(token)) return c.json({ error: "That token doesn't match HUNT_TOKEN." }, 401);
    const secure = new URL(c.req.url).protocol === "https:" ? "; Secure" : "";
    c.header("Set-Cookie", `${COOKIE}=${await sessionValue()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 180}${secure}`);
    return c.json({ ok: true });
  });
  app.post("/api/logout", (c) => {
    c.header("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return c.json({ ok: true });
  });

  app.get("/api/me", async (c) => {
    const origin = new URL(c.req.url).origin;
    const me: Me = {
      authed: await authed(c.req.raw, true),
      needs_token: !deps.dev() && !hasToken(),
      dev: deps.dev(),
      version: VERSION,
      mcp_url: `${origin}/mcp`,
      lists: starterLists(),
    };
    return c.json(me);
  });

  // Everything below needs the cookie (website) or the token (scripts).
  app.use("/api/*", async (c, next) => {
    if (!deps.dev() && !hasToken()) return c.json({ error: NEEDS_TOKEN }, 503);
    if (!(await authed(c.req.raw, true))) return c.json({ error: "Sign in first." }, 401);
    // Cookie-authenticated writes must be same-origin JSON (no form posts from other sites).
    if (c.req.method !== "GET" && !bearer(c.req.raw) && !(c.req.header("content-type") || "").includes("application/json")) {
      return c.json({ error: "Send JSON." }, 415);
    }
    await next();
  });

  app.get("/api/tools", (c) => c.json({ tools: toolList() }));
  app.post("/api/tools/:name", async (c) => {
    const args = await c.req.json().catch(() => ({}));
    return c.json((await callTool(c.req.param("name"), args, { by: "you", wake: deps.wake })) as any);
  });
  app.get("/api/pulse", (c) => c.json(pulse(Number(c.req.query("since") || 0), c.req.query("instance") || undefined)));

  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));
  return app;
}
