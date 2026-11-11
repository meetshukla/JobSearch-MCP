/**
 * Hunt's MCP server: Streamable HTTP, stateless, plain JSON responses.
 *   POST /mcp  with  Authorization: Bearer <HUNT_TOKEN>
 */
import { callTool, toolList, INSTRUCTIONS, type ToolCtx } from "./tools.ts";

export const VERSION = "3.0.0";
const SUPPORTED = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_INFO = { name: "hunt", title: "Hunt", version: VERSION };

type Msg = { jsonrpc?: string; id?: string | number | null; method?: string; params?: any };

const ok = (id: Msg["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const fail = (id: Msg["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function handle(m: Msg, ctx: ToolCtx) {
  if (!m || typeof m !== "object" || typeof m.method !== "string") return fail(m?.id, -32600, "Invalid request");
  if (m.id === undefined || m.id === null) return null; // notifications
  switch (m.method) {
    case "initialize": {
      const want = String(m.params?.protocolVersion ?? "");
      return ok(m.id, {
        protocolVersion: SUPPORTED.includes(want) ? want : SUPPORTED[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok(m.id, {});
    case "tools/list":
      return ok(m.id, { tools: toolList() });
    case "tools/call": {
      const name = String(m.params?.name ?? "");
      try {
        const result = await callTool(name, m.params?.arguments ?? {}, ctx);
        return ok(m.id, { content: [{ type: "text", text: JSON.stringify(result ?? { ok: true }) }] });
      } catch (e: any) {
        return ok(m.id, { content: [{ type: "text", text: `Error: ${String(e?.message || e)}` }], isError: true });
      }
    }
    case "resources/list":
      return ok(m.id, { resources: [] });
    case "resources/templates/list":
      return ok(m.id, { resourceTemplates: [] });
    case "prompts/list":
      return ok(m.id, { prompts: [] });
    default:
      return fail(m.id, -32601, `Method not found: ${m.method}`);
  }
}

/** The HTTP status and JSON body. A null body means 202 Accepted (notifications only). */
export async function handleMcp(body: unknown, ctx: ToolCtx): Promise<{ status: number; json: unknown | null }> {
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handle(m, ctx)))).filter(Boolean);
    return out.length ? { status: 200, json: out } : { status: 202, json: null };
  }
  const r = await handle(body as Msg, ctx);
  return r ? { status: 200, json: r } : { status: 202, json: null };
}
