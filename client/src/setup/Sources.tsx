import { useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, Check, CircleAlert, Clock, Pause, Play, RefreshCw, Search, Trash2, X } from "lucide-react";
import type { AddSourceResult, Me, SourceRow, SourceState } from "../../../shared/types.ts";
import { tool, type SourceAction } from "../api.ts";
import { bump, useLoad } from "../live.ts";
import { ago, plural } from "../format.ts";
import { Button, ConfirmButton, Empty, Spinner, toast } from "../ui.tsx";
import { SectionHead } from "./SetupPage.tsx";

const STATES: { id: SourceState | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "queued", label: "Queued" },
  { id: "error", label: "Failing" },
  { id: "paused", label: "Paused" },
];

const PAGE = 100;

export function Sources({ me }: { me: Me }) {
  return (
    <div className="section section-wide">
      <SectionHead title="Sources">Where jobs come from: company job boards, remote job boards and RSS feeds. Hunt reads each one about once an hour.</SectionHead>
      <AddSources />
      {me.lists.length > 0 && <StarterLists lists={me.lists} />}
      <SourceList />
    </div>
  );
}

function AddSources() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<AddSourceResult[]>([]);
  const items = text.split("\n").map((s) => s.trim()).filter(Boolean);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!items.length) return;
    setBusy(true);
    try {
      const r = await tool("add_sources", { items });
      setResults(r.results);
      setText(r.results.filter((x) => x.status === "error").map((x) => x.input).join("\n"));
      bump(["sources"]);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="group add-sources" onSubmit={submit}>
      <label className="group-title" htmlFor="add-sources">
        Add sources
      </label>
      <p className="help">One per line. Company names, careers pages, job board URLs, RSS feeds, or a board id.</p>
      <textarea
        id="add-sources"
        className="textarea mono-ish"
        rows={5}
        spellCheck={false}
        placeholder={"Shopify\nhttps://jobs.ashbyhq.com/linear\ngreenhouse:stripe\nhttps://example.com/careers\nremotive"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
      />
      <div className="form-actions">
        <span className="help push-start">Names and careers pages take a few minutes to resolve.</span>
        <Button type="submit" variant="primary" disabled={!items.length} busy={busy}>
          {items.length > 1 ? `Add ${items.length} sources` : "Add source"}
        </Button>
      </div>
      {results.length > 0 && (
        <ul className="results" aria-live="polite">
          {results.map((r, i) => (
            <li key={`${r.input}-${i}`} className={`result result-${r.status}`}>
              <ResultIcon status={r.status} />
              <span className="result-input">{r.source?.name && r.source.name !== r.input ? `${r.input} → ${r.source.name}` : r.input}</span>
              <span className="result-msg">{r.message}</span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

function ResultIcon({ status }: { status: AddSourceResult["status"] }) {
  if (status === "error") return <CircleAlert size={14} strokeWidth={1.75} className="result-icon" />;
  if (status === "queued") return <Clock size={14} strokeWidth={1.75} className="result-icon" />;
  return <Check size={14} strokeWidth={2} className="result-icon" />;
}

function StarterLists({ lists }: { lists: Me["lists"] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const importList = async (id: string) => {
    setBusy(id);
    try {
      const r = await tool("add_sources", { list: id });
      setDone((d) => ({ ...d, [id]: r.results[0]?.message ?? "Imported." }));
      bump(["sources"]);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="group">
      <h2 className="group-title">Starter lists</h2>
      <ul className="lists">
        {lists.map((l) => (
          <li key={l.id} className="list-card">
            <div className="list-card-text">
              <p className="list-card-title">
                {l.label} <span className="muted tnum">· {plural(l.companies, "company", "companies")}</span>
              </p>
              <p className="help">{done[l.id] ?? l.description}</p>
            </div>
            <Button onClick={() => importList(l.id)} busy={busy === l.id} disabled={Boolean(done[l.id])} icon={done[l.id] ? <Check size={14} strokeWidth={2} /> : undefined}>
              {done[l.id] ? "Imported" : "Import"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourceList() {
  const [state, setState] = useState<SourceState | "all">("all");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  const listKey = `${state}|${query}`;
  const [paged, setPaged] = useState({ key: listKey, limit: PAGE });
  const limit = paged.key === listKey ? paged.limit : PAGE;

  const data = useLoad(() => tool("list_sources", { state: state === "all" ? undefined : state, query: query || undefined, limit }), `${listKey}|${limit}`, ["sources", "settings"]);
  const counts = data.data?.counts;
  const all = counts ? counts.active + counts.queued + counts.error + counts.paused : 0;

  const act = async (s: SourceRow, action: SourceAction) => {
    try {
      await tool("update_sources", { ids: [s.id], action });
      bump(["sources", ...(action === "remove" ? (["jobs"] as const) : [])]);
      toast(action === "remove" ? `Removed ${s.name}` : action === "read_now" ? `Reading ${s.name} now` : action === "pause" ? `Paused ${s.name}` : `Resumed ${s.name}`);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div className="group">
      <div className="group-head">
        <h2 className="group-title">Your sources</h2>
        {counts && <span className="muted tnum">{all.toLocaleString()}</span>}
      </div>
      <div className="source-tools">
        <div className="tabs tabs-pill" role="tablist" aria-label="Filter by state">
          {STATES.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={state === s.id} className="tab" onClick={() => setState(s.id)}>
              {s.label}
              <span className="tab-count">{counts ? (s.id === "all" ? all : counts[s.id]).toLocaleString() : ""}</span>
            </button>
          ))}
        </div>
        <label className="search search-sm">
          <Search size={16} strokeWidth={1.75} className="search-icon" />
          <input type="search" placeholder="Search sources" aria-label="Search sources" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && (
            <button type="button" className="search-clear" onClick={() => setQ("")} aria-label="Clear search">
              <X size={14} strokeWidth={2} />
            </button>
          )}
        </label>
      </div>
      {!data.data ? (
        <div className="setup-loading">{data.error ?? <Spinner />}</div>
      ) : data.data.sources.length === 0 ? (
        <Empty title={query ? `No sources match “${query}”` : state === "all" ? "No sources yet" : `No ${STATES.find((s) => s.id === state)!.label.toLowerCase()} sources`}>
          {state === "all" && !query ? "Add companies above, or import a starter list." : undefined}
        </Empty>
      ) : (
        <>
          <ul className="sources">
            <li className="sources-head" aria-hidden>
              <span>Source</span>
              <span>State</span>
              <span className="num">Postings</span>
              <span className="num">Matching</span>
              <span>Last read</span>
              <span />
            </li>
            {data.data.sources.map((s) => (
              <SourceItem key={s.id} s={s} act={act} />
            ))}
          </ul>
          {data.data.total > data.data.sources.length && (
            <div className="more">
              <Button variant="ghost" onClick={() => setPaged({ key: listKey, limit: limit + PAGE })} busy={data.loading}>
                Show more of {data.data.total.toLocaleString()}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const STATE_LABEL: Record<SourceState, string> = { active: "Active", queued: "Queued", error: "Failing", paused: "Paused" };
const KIND_LABEL = { company: "Company", board: "Job board", feed: "RSS feed" };

function SourceItem({ s, act }: { s: SourceRow; act: (s: SourceRow, a: SourceAction) => void }) {
  const system = s.system ? s.system.charAt(0).toUpperCase() + s.system.slice(1) : null;
  return (
    <li className="source">
      <div className="source-id">
        <span className="source-name">
          {s.url ? (
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="link-quiet">
              {s.name}
              <ArrowUpRight size={12} strokeWidth={2} className="ext" />
            </a>
          ) : (
            s.name
          )}
        </span>
        <span className="source-sys">{s.kind === "company" ? (system ?? (s.state === "error" ? "No job board found" : "Looking for its board")) : KIND_LABEL[s.kind]}</span>
        <span className="source-mobile">
          <span className={`state state-${s.state}`}>
            <span className="status-dot" />
            {STATE_LABEL[s.state]}
          </span>
          <span className="tnum">{plural(s.listings, "posting")}</span>
          <span className="tnum">{s.matching.toLocaleString()} matching</span>
          <span>{s.last_read_at ? `read ${ago(s.last_read_at)}` : "not read yet"}</span>
        </span>
        {s.last_error && <span className="source-error">{s.last_error}</span>}
      </div>
      <span className="source-state">
        <span className={`state state-${s.state}`}>
          <span className="status-dot" />
          {STATE_LABEL[s.state]}
        </span>
      </span>
      <span className="num tnum" data-label="Postings">
        {s.listings.toLocaleString()}
      </span>
      <span className={`num tnum${s.matching ? " has-match" : ""}`} data-label="Matching">
        {s.matching.toLocaleString()}
      </span>
      <span className="source-read" data-label="Last read">
        {s.last_read_at ? ago(s.last_read_at) : s.state === "queued" ? "Soon" : "Not yet"}
      </span>
      <span className="source-actions">
        <Button variant="ghost" size="sm" icon={<RefreshCw size={14} strokeWidth={1.75} />} onClick={() => act(s, "read_now")} aria-label={`Read ${s.name} now`} title="Read now" />
        {s.state === "paused" ? (
          <Button variant="ghost" size="sm" icon={<Play size={14} strokeWidth={1.75} />} onClick={() => act(s, "resume")} aria-label={`Resume ${s.name}`} title="Resume" />
        ) : (
          <Button variant="ghost" size="sm" icon={<Pause size={14} strokeWidth={1.75} />} onClick={() => act(s, "pause")} aria-label={`Pause ${s.name}`} title="Pause" />
        )}
        <ConfirmButton onConfirm={() => act(s, "remove")} confirmLabel="Remove" icon={<Trash2 size={14} strokeWidth={1.75} />} label={`Remove ${s.name}`} />
      </span>
    </li>
  );
}
