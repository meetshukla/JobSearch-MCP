/**
 * Cloudflare Worker entry. The website is static files (client/dist); /mcp and /api go to the Hunt Durable Object.
 */
import type { Env } from "./hunt-do.ts";
export { Hunt } from "./hunt-do.ts";

const hunt = (env: Env) => env.HUNT.get(env.HUNT.idFromName("main"));
const DYNAMIC = /^\/(mcp$|api\/|\.well-known\/)/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (DYNAMIC.test(pathname)) return hunt(env).fetch(request);
    return env.ASSETS.fetch(request);
  },
  // Safety net: keep the collector's alarm set.
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await hunt(env).fetch("https://hunt.internal/internal/wake");
  },
} satisfies ExportedHandler<Env>;
