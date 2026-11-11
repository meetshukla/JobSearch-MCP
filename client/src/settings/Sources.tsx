import { useEffect, useState, type FormEvent } from "react";
import { Menu } from "@base-ui/react/menu";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { ArrowUpRight, Check, CircleAlert, Clock, Ellipsis, Pause, Play, RefreshCw, Search, Trash2, X } from "lucide-react";
import type { AddSourceResult, Me, SourceRow, SourceState } from "../../../shared/types.ts";
import { tool, type SourceAction } from "../api.ts";
import { bump, useLoad } from "../live.ts";
import { ago, plural } from "../format.ts";
import { MenuPopup } from "../overlay.tsx";
import { Button, Empty, Keys, Segmented, Spinner } from "../ui.tsx";
import { toast } from "../toast.tsx";
import { PageHead, Section } from "./SettingsView.tsx";

const PAGE = 100;
type StateFilter = SourceState | "all";
const STATE_LABEL: Record<SourceState, string> = { active: "Active", queued: "Queued", error: "Failing", paused: "Paused" };
const KIND_LABEL = { company: "Company", board: "Job board", feed: "RSS feed" };

export function Sources({ me }: { me: Me }) {
  return (
    <>
      <PageHead title="Sources">Where jobs come from: company job boards, remote job boards and RSS feeds. Hunt reads each one about once an hour.</PageHead>
      <AddSources />
      {me.lists.length > 0 && <StarterLists lists={me.lists} />}
      <SourceList />
    </>
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
      toast((err as Error).message, { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Add sources" id="add-sources" description="One per line: company names, careers pages, job board links, RSS feeds, or a board like greenhouse:stripe.">
      <form className="add-sources" onSubmit={submit}>
        <textarea
          className="textarea mono-input"
          rows={4}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          aria-label="Sources to add, one per line"
          placeholder={"Shopify\nhttps://jobs.ashbyhq.com/linear\ngreenhouse:stripe"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
        />
        <div className="form-actions">
          <span className="help push-start">Names and careers pages take a few minutes to resolve.</span>
          <Keys k="⌘ ↵" />
          <Button type="submit" variant="primary" disabled={!items.length} busy={busy}>
            {items.length > 1 ? `Add ${items.length} sources` : "Add source"}
          </Button>
        </div>
      </form>
      {results.length > 0 && (
        <ul className="results" aria-live="polite">
          {results.map((r, i) => (
            <li key={`${r.input}-${i}`} className="result" data-status={r.status}>
              {r.status === "error" ? <CircleAlert size={14} strokeWidth={1.75} /> : r.status === "queued" ? <Clock size={14} strokeWidth={1.75} /> : <Check size={14} strokeWidth={2} />}
              <span className="result-input ellipsis">{r.source?.name && r.source.name !== r.input ? `${r.input}, found ${r.source.name}` : r.input}</span>
              <span className="result-msg">{r.message}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
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
      toast((e as Error).message, { tone: "error" });
    } finally {
      setBusy(null);
    }
  };
  return (
    <Section title="Starter lists" id="starter">
      <ul className="rows-plain">
        {lists.map((l) => (
          <li key={l.id} className="starter">
            <div className="starter-text">
              <p>
                {l.label} <span className="t3 tnum">{plural(l.companies, "company", "companies")}</span>
              </p>
              <p className="help">{done[l.id] ?? l.description}</p>
            </div>
            <Button onClick={() => importList(l.id)} busy={busy === l.id} disabled={Boolean(done[l.id])} icon={done[l.id] ? <Check size={14} strokeWidth={2} /> : undefined}>
              {done[l.id] ? "Imported" : "Import"}
            </Button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const initialState = (): StateFilter => {
  const s = new URLSearchParams(location.search).get("state");
  return s === "active" || s === "queued" || s === "error" || s === "paused" ? s : "all";
};

function SourceList() {
  const [state, setState] = useState<StateFilter>(initialState);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [removing, setRemoving] = useState<SourceRow | null>(null);
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
      toast((e as Error).message, { tone: "error" });
    }
  };

  const options: { value: StateFilter; label: string }[] = [
    { value: "all", label: counts ? `All ${all.toLocaleString()}` : "All" },
    { value: "active", label: counts ? `Active ${counts.active.toLocaleString()}` : "Active" },
    { value: "error", label: counts ? `Failing ${counts.error.toLocaleString()}` : "Failing" },
    { value: "queued", label: counts ? `Queued ${counts.queued.toLocaleString()}` : "Queued" },
    { value: "paused", label: counts ? `Paused ${counts.paused.toLocaleString()}` : "Paused" },
  ];

  return (
    <Section title="Your sources" id="your-sources">
      <div className="source-tools">
        <div className="scroll-x">
          <Segmented label="Show sources" value={state} onChange={setState} options={options} />
        </div>
        <label className="search">
          <Search size={14} strokeWidth={1.75} className="search-icon" aria-hidden />
          <input type="search" placeholder="Search sources" aria-label="Search sources" value={q} autoComplete="off" onChange={(e) => setQ(e.target.value)} />
          {q && (
            <button type="button" className="search-clear" onClick={() => setQ("")} aria-label="Clear search">
              <X size={14} strokeWidth={2} />
            </button>
          )}
        </label>
      </div>
      {!data.data ? (
        <div className="settings-loading">{data.error ?? <Spinner />}</div>
      ) : data.data.sources.length === 0 ? (
        <Empty title={query ? `No sources match “${query}”` : state === "all" ? "No sources yet" : `No ${STATE_LABEL[state].toLowerCase()} sources`}>
          {state === "all" && !query ? "Add companies above, or import a starter list." : undefined}
        </Empty>
      ) : (
        <>
          <div className="sources" role="table" aria-label="Sources">
            <div className="source source-head" role="row">
              <span role="columnheader">Source</span>
              <span role="columnheader">State</span>
              <span role="columnheader" className="num">
                Postings
              </span>
              <span role="columnheader" className="num">
                Matching
              </span>
              <span role="columnheader">Last read</span>
              <span role="columnheader">
                <span className="sr-only">Actions</span>
              </span>
            </div>
            {data.data.sources.map((s) => (
              <SourceItem key={s.id} s={s} act={act} onRemove={() => setRemoving(s)} />
            ))}
          </div>
          {data.data.total > data.data.sources.length && (
            <div className="list-end">
              <Button variant="ghost" onClick={() => setPaged({ key: listKey, limit: limit + PAGE })} busy={data.loading}>
                Show more of {data.data.total.toLocaleString()}
              </Button>
            </div>
          )}
        </>
      )}
      <RemoveDialog source={removing} onClose={() => setRemoving(null)} onConfirm={(s) => act(s, "remove")} />
    </Section>
  );
}

function SourceItem({ s, act, onRemove }: { s: SourceRow; act: (s: SourceRow, a: SourceAction) => void; onRemove: () => void }) {
  const system = s.system ? s.system.charAt(0).toUpperCase() + s.system.slice(1) : null;
  const kind = s.kind === "company" ? (system ?? (s.state === "error" ? "No job board found" : "Looking for its board")) : KIND_LABEL[s.kind];
  const read = s.last_read_at ? ago(s.last_read_at) : s.state === "queued" ? "Soon" : "Not yet";
  return (
    <div className="source" role="row">
      <span className="source-id" role="cell">
        <span className="source-name ellipsis">
          {s.url ? (
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="link-quiet">
              {s.name}
              <ArrowUpRight size={12} strokeWidth={1.75} className="ext" aria-hidden />
            </a>
          ) : (
            s.name
          )}
        </span>
        <span className="source-kind ellipsis">{kind}</span>
        {s.last_error && <span className="source-error">{s.last_error}</span>}
      </span>
      <span className="source-state" role="cell" data-state={s.state}>
        <span className="state-dot" aria-hidden />
        {STATE_LABEL[s.state]}
      </span>
      <span className="num tnum t2" role="cell" data-label="postings">
        {s.listings.toLocaleString()}
      </span>
      <span className="num tnum" role="cell" data-label="matching" data-zero={s.matching === 0 || undefined}>
        {s.matching.toLocaleString()}
      </span>
      <span className="source-read t3" role="cell">
        {read}
      </span>
      <span className="source-actions" role="cell">
        <Menu.Root>
          <Menu.Trigger className="btn btn-ghost icon-only" aria-label={`Actions for ${s.name}`}>
            <Ellipsis size={16} strokeWidth={1.75} />
          </Menu.Trigger>
          <MenuPopup align="end">
            <Menu.Item className="menu-item" onClick={() => act(s, "read_now")}>
              <RefreshCw size={14} strokeWidth={1.75} />
              <span className="menu-item-label">Read now</span>
            </Menu.Item>
            {s.state === "paused" ? (
              <Menu.Item className="menu-item" onClick={() => act(s, "resume")}>
                <Play size={14} strokeWidth={1.75} />
                <span className="menu-item-label">Resume</span>
              </Menu.Item>
            ) : (
              <Menu.Item className="menu-item" onClick={() => act(s, "pause")}>
                <Pause size={14} strokeWidth={1.75} />
                <span className="menu-item-label">Pause</span>
              </Menu.Item>
            )}
            <Menu.Separator className="menu-sep" />
            <Menu.Item className="menu-item menu-danger" onClick={onRemove}>
              <Trash2 size={14} strokeWidth={1.75} />
              <span className="menu-item-label">Remove…</span>
            </Menu.Item>
          </MenuPopup>
        </Menu.Root>
      </span>
    </div>
  );
}

function RemoveDialog({ source, onClose, onConfirm }: { source: SourceRow | null; onClose: () => void; onConfirm: (s: SourceRow) => void }) {
  const [shown, setShown] = useState(source);
  if (source && source !== shown) setShown(source);
  return (
    <AlertDialog.Root open={source !== null} onOpenChange={(o) => !o && onClose()}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="scrim" />
        <AlertDialog.Popup className="dialog confirm">
          <AlertDialog.Title className="dialog-title">Remove {shown?.name}?</AlertDialog.Title>
          <AlertDialog.Description className="dialog-text">Hunt stops reading it and drops its jobs you haven't touched. Jobs you acted on stay.</AlertDialog.Description>
          <div className="form-actions">
            <AlertDialog.Close className="btn btn-ghost">Cancel</AlertDialog.Close>
            <Button
              variant="danger"
              onClick={() => {
                if (shown) onConfirm(shown);
                onClose();
              }}
            >
              Remove source
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
