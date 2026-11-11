import { useState } from "react";
import type { Me } from "../../../shared/types.ts";
import { api } from "../api.ts";
import { useLoad } from "../live.ts";
import { Code, CopyButton } from "../ui.tsx";
import { SectionHead } from "./SetupPage.tsx";

const CLIENTS = ["Codex", "Claude Code", "Other clients"] as const;
type Client = (typeof CLIENTS)[number];

function command(client: Client, url: string) {
  if (client === "Codex") return `codex mcp add hunt --url ${url} --bearer-token-env-var HUNT_TOKEN`;
  if (client === "Claude Code") return `claude mcp add --transport http hunt ${url} --header "Authorization: Bearer $HUNT_TOKEN"`;
  return JSON.stringify({ mcpServers: { hunt: { type: "http", url, headers: { Authorization: "Bearer ${HUNT_TOKEN}" } } } }, null, 2);
}

export function Connect({ me }: { me: Me }) {
  const [client, setClient] = useState<Client>("Codex");
  const tools = useLoad(() => api.tools(), "tools", []);
  return (
    <div className="section">
      <SectionHead title="Connect your agent">
        Your agent reads jobs through Hunt's MCP server, writes a verdict, and records what you applied to. The website shows the same data.
      </SectionHead>

      <div className="group">
        <label className="label" htmlFor="mcp-url">
          MCP server URL
        </label>
        <div className="url-field">
          <input id="mcp-url" className="url-input" readOnly value={me.mcp_url} onFocus={(e) => e.target.select()} />
          <CopyButton text={me.mcp_url} label="Copy URL" />
        </div>
        <p className="help">
          It takes your <code className="inline-code">HUNT_TOKEN</code> as a bearer token: the secret you set when you deployed Hunt. Keep it in your shell, for example with{" "}
          <code className="inline-code">export HUNT_TOKEN=…</code> in your profile.
        </p>
      </div>

      <div className="group">
        <div className="seg-tabs" role="tablist" aria-label="Agent">
          {CLIENTS.map((c) => (
            <button key={c} type="button" role="tab" aria-selected={c === client} className="seg-tab" onClick={() => setClient(c)}>
              {c}
            </button>
          ))}
        </div>
        <Code label={client === "Other clients" ? "MCP config (JSON)" : "Run in your terminal"}>{command(client, me.mcp_url)}</Code>
        {client === "Other clients" && <p className="help">Most clients read this shape. Some want the token written in place of ${"{HUNT_TOKEN}"}.</p>}
      </div>

      <div className="group">
        <h2 className="group-title">Skills for your agent</h2>
        <p className="help">Two optional skills in Hunt's repo teach your agent how to work with your jobs. Copy them into your agent's skills folder.</p>
        <ul className="skill-list">
          <li>
            <code className="inline-code">skills/review-jobs</code>
            <span>How to judge fit against your profile and write a verdict.</span>
          </li>
          <li>
            <code className="inline-code">skills/find-job-contacts</code>
            <span>How to find people at the company and their emails.</span>
          </li>
        </ul>
      </div>

      <div className="group">
        <h2 className="group-title">What your agent can do</h2>
        {tools.data ? (
          <ul className="tool-list">
            {tools.data.tools.map((t) => (
              <li key={t.name}>
                <code className="tool-name">{t.name}</code>
                <span className="tool-desc">{t.description.split(/(?<=\.)\s/)[0]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="help">{tools.error ?? "Loading…"}</p>
        )}
      </div>
    </div>
  );
}
