import { useState } from "react";
import type { Me } from "../../../shared/types.ts";
import { api } from "../api.ts";
import { useLoad } from "../live.ts";
import { Code, CopyButton, Segmented } from "../ui.tsx";
import { PageHead, Section } from "./SettingsView.tsx";

type Client = "codex" | "claude" | "other";
const CLIENTS: { value: Client; label: string }[] = [
  { value: "codex", label: "Codex" },
  { value: "claude", label: "Claude Code" },
  { value: "other", label: "Other" },
];

function command(client: Client, url: string) {
  if (client === "codex") return `codex mcp add hunt --url ${url} --bearer-token-env-var HUNT_TOKEN`;
  if (client === "claude") return `claude mcp add --transport http hunt ${url} --header "Authorization: Bearer $HUNT_TOKEN"`;
  return JSON.stringify({ mcpServers: { hunt: { type: "http", url, headers: { Authorization: "Bearer ${HUNT_TOKEN}" } } } }, null, 2);
}

export function Connect({ me }: { me: Me }) {
  const [client, setClient] = useState<Client>("codex");
  const tools = useLoad(() => api.tools(), "tools", []);
  return (
    <>
      <PageHead title="Connect agent">Your agent reads jobs through Hunt's MCP server, writes a verdict, and records what you applied to. This website shows the same data.</PageHead>

      <Section title="MCP server" id="mcp" description={<>It takes your <code className="inline-code">HUNT_TOKEN</code> as a bearer token, the secret you set when you deployed Hunt.</>}>
        <div className="url-field">
          <input className="input mono" readOnly value={me.mcp_url} aria-label="MCP server URL" onFocus={(e) => e.target.select()} />
          <CopyButton text={me.mcp_url} label="Copy URL" />
        </div>
      </Section>

      <Section title="Add Hunt to your agent" id="add" description="Run this once in your terminal, with HUNT_TOKEN set in your shell profile.">
        <div className="stack-8">
          <Segmented label="Agent" value={client} onChange={setClient} options={CLIENTS} />
          <Code>{command(client, me.mcp_url)}</Code>
          {client === "other" && <p className="help">Most clients read this shape. Some want the token written in place of {"${HUNT_TOKEN}"}.</p>}
        </div>
      </Section>

      <Section title="Skills" id="skills" description="Two optional skills in Hunt's repo teach your agent the daily routine. Copy them into your agent's skills folder.">
        <ul className="rows-plain">
          <li>
            <code className="mono">skills/review-jobs</code>
            <span className="t2">How to judge fit against your profile and write a verdict.</span>
          </li>
          <li>
            <code className="mono">skills/find-job-contacts</code>
            <span className="t2">How to find people at the company and their emails.</span>
          </li>
        </ul>
      </Section>

      <Section title="What your agent can do" id="tools">
        {tools.data ? (
          <ul className="rows-plain">
            {tools.data.tools.map((t) => (
              <li key={t.name}>
                <code className="mono">{t.name}</code>
                <span className="t2">{t.description.split(/(?<=\.)\s/)[0]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="help">{tools.error ?? "Loading…"}</p>
        )}
      </Section>
    </>
  );
}
