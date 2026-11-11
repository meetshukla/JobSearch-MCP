/**
 * Call a Hunt tool over MCP from the terminal:
 *   HUNT_TOKEN=... node scripts/mcp.ts https://hunt.example.workers.dev today
 *   node scripts/mcp.ts http://localhost:8787 list_jobs '{"view":"to_review","limit":5}'
 * With no tool name it prints the tool list.
 */
const [base, tool, args] = process.argv.slice(2);
if (!base) {
  console.error("Usage: node scripts/mcp.ts <hunt url> [tool] [json args]");
  process.exit(1);
}

let id = 0;
async function rpc(method: string, params: unknown) {
  const res = await fetch(`${base.replace(/\/$/, "")}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(process.env.HUNT_TOKEN ? { Authorization: `Bearer ${process.env.HUNT_TOKEN}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.error) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body?.error ?? body)}`);
  return body.result;
}

await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "hunt-cli", version: "1" } });
if (!tool) {
  const { tools } = await rpc("tools/list", {});
  for (const t of tools) console.log(`${t.name.padEnd(16)} ${t.description.split(". ")[0]}`);
} else {
  const r = await rpc("tools/call", { name: tool, arguments: args ? JSON.parse(args) : {} });
  const text = r.content?.[0]?.text ?? "";
  if (r.isError) {
    console.error(text);
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
}
