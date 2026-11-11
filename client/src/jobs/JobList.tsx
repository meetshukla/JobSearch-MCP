import { useEffect, useState, type FormEvent, type RefObject } from "react";
import { CalendarClock, Inbox, Link2, Plus, Search, SearchX, Users, X } from "lucide-react";
import type { JobRow, ListJobsResult, Today, View } from "../../../shared/types.ts";
import { VIEWS } from "../../../shared/types.ts";
import { tool } from "../api.ts";
import { bump } from "../live.ts";
import { VIEW_META, day, isDue, shortAge } from "../format.ts";
import { Link, jobPath, type ListState, type Posted } from "../router.tsx";
import { Button, Empty, ScoreBadge, Spinner, StatusChip, toast } from "../ui.tsx";

type BarProps = {
  list: ListState;
  counts: ListJobsResult["counts"] | undefined;
  savedDays: number | null | undefined;
  setList: (patch: Partial<ListState>) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  onTracked: (id: string) => void;
};

type RowsProps = {
  list: ListState;
  data: ListJobsResult | undefined;
  loading: boolean;
  error: string | null;
  retry: () => void;
  today: Today | undefined;
  openId: string | null;
  cursor: string | null;
  onCursor: (id: string) => void;
  setList: (patch: Partial<ListState>) => void;
  onMore: () => void;
};

export function ListBar(p: BarProps) {
  const [tracking, setTracking] = useState(false);
  return (
    <div className="list-bar">
      <div className="list-bar-row">
        <Tabs view={p.list.view} counts={p.counts} onView={(view) => p.setList({ view })} />
        <Tools {...p} tracking={tracking} setTracking={setTracking} />
      </div>
      {tracking && <TrackForm onDone={(id) => (setTracking(false), p.onTracked(id))} onCancel={() => setTracking(false)} />}
    </div>
  );
}

export function ListRows(p: RowsProps) {
  return (
    <section className="list-pane" aria-label="Jobs">
      <Rows {...p} />
    </section>
  );
}

function Tabs({ view, counts, onView }: { view: View; counts: ListJobsResult["counts"] | undefined; onView: (v: View) => void }) {
  return (
    <div className="tabs" role="tablist" aria-label="Views">
      {VIEWS.map((v) => (
        <button key={v} type="button" role="tab" aria-selected={v === view} className="tab" onClick={() => onView(v)}>
          {VIEW_META[v].label}
          <span className="tab-count">{counts ? counts[v].toLocaleString() : ""}</span>
        </button>
      ))}
    </div>
  );
}

const POSTED_OPTIONS: { value: string; posted: Posted; label: (saved: string) => string }[] = [
  { value: "saved", posted: "saved", label: (s) => s },
  { value: "1", posted: 1, label: () => "Past 24 hours" },
  { value: "3", posted: 3, label: () => "Past 3 days" },
  { value: "any", posted: null, label: () => "Any age" },
];

function Tools({ list, setList, searchRef, savedDays, tracking, setTracking }: BarProps & { tracking: boolean; setTracking: (v: boolean) => void }) {
  const [q, setQ] = useState(list.q);
  useEffect(() => setQ(list.q), [list.q]);
  useEffect(() => {
    if (q === list.q) return;
    const t = setTimeout(() => setList({ q: q.trim() }), 200);
    return () => clearTimeout(t);
  }, [q]);
  const saved = savedDays === null ? "Any age (saved)" : savedDays === undefined ? "Saved window" : `Past ${savedDays} days (saved)`;
  const postedValue = POSTED_OPTIONS.find((o) => o.posted === list.posted)?.value ?? "saved";

  return (
    <div className="tools">
      <label className="search">
        <Search size={16} strokeWidth={1.75} className="search-icon" />
        <input ref={searchRef} type="search" placeholder="Search title, company, place" aria-label="Search jobs" value={q} onChange={(e) => setQ(e.target.value)} />
        {q ? (
          <button type="button" className="search-clear" onClick={() => (setQ(""), setList({ q: "" }))} aria-label="Clear search">
            <X size={14} strokeWidth={2} />
          </button>
        ) : (
          <kbd className="kbd search-kbd">/</kbd>
        )}
      </label>
      <button type="button" className="toggle-chip" aria-pressed={list.remote} onClick={() => setList({ remote: !list.remote })}>
        Remote only
      </button>
      <label className="select-chip" data-active={list.posted !== "saved"}>
        <span className="sr-only">Posted within</span>
        <select value={postedValue} onChange={(e) => setList({ posted: POSTED_OPTIONS.find((o) => o.value === e.target.value)!.posted })}>
          {POSTED_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label(saved)}
            </option>
          ))}
        </select>
      </label>
      <Button size="md" variant="secondary" icon={<Plus size={16} strokeWidth={1.75} />} onClick={() => setTracking(!tracking)} aria-expanded={tracking} aria-label="Track a job" className="track-toggle">
        <span className="btn-text">Track a job</span>
      </Button>
    </div>
  );
}

function TrackForm({ onDone, onCancel }: { onDone: (id: string) => void; onCancel: () => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const u = url.trim();
    if (!/^https?:\/\/\S+$/i.test(u)) return setError("Paste a full link that starts with https://");
    setBusy(true);
    setError(null);
    try {
      const job = await tool("add_job", { url: u });
      bump(["jobs"]);
      toast(`Tracking ${job.title} at ${job.company}`);
      onDone(job.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="track" onSubmit={submit} noValidate>
      <div className={`input-wrap input-sm${error ? " invalid" : ""}`}>
        <Link2 size={16} strokeWidth={1.75} className="input-icon" />
        <input
          className="input"
          type="url"
          inputMode="url"
          autoFocus
          placeholder="Any job link: Greenhouse, Lever, Ashby, a careers page"
          aria-label="Job link to track"
          value={url}
          onChange={(e) => (setUrl(e.target.value), setError(null))}
          onKeyDown={(e) => e.key === "Escape" && onCancel()}
        />
      </div>
      <Button variant="ghost" onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
      <Button type="submit" variant="primary" busy={busy}>
        Track job
      </Button>
      <p className={error ? "field-error track-note" : "track-note"} role={error ? "alert" : undefined}>
        {error ?? "Hunt reads the posting and keeps it in your list, whatever your filters say."}
      </p>
    </form>
  );
}

function Rows({ list, data, loading, error, retry, today, openId, cursor, onCursor, setList, onMore }: RowsProps) {
  if (!data) {
    if (error)
      return (
        <Empty title="Couldn't load jobs" action={<Button onClick={retry}>Try again</Button>}>
          {error}
        </Empty>
      );
    return <Skeleton />;
  }
  if (!data.jobs.length) return <ListEmpty list={list} data={data} today={today} setList={setList} />;
  const more = data.total - data.jobs.length;
  return (
    <>
      <ul className="rows" aria-busy={loading}>
        {data.jobs.map((j) => (
          <li key={j.id}>
            <Row job={j} list={list} open={j.id === openId} cursor={j.id === cursor} onFocus={() => onCursor(j.id)} />
          </li>
        ))}
      </ul>
      {more > 0 && (
        <div className="more">
          <Button variant="ghost" onClick={onMore} busy={loading}>
            Show {Math.min(50, more)} more · {more.toLocaleString()} left
          </Button>
        </div>
      )}
    </>
  );
}

function Row({ job, list, open, cursor, onFocus }: { job: JobRow; list: ListState; open: boolean; cursor: boolean; onFocus: () => void }) {
  const age = shortAge(job.posted_at);
  const due = isDue(job.follow_up_at);
  return (
    <Link
      to={jobPath(job.id, list)}
      className="row"
      data-job={job.id}
      data-cursor={cursor || undefined}
      aria-current={open ? "true" : undefined}
      onFocus={onFocus}
      onMouseDown={onFocus}
    >
      <span className="row-main">
        <span className="row-title">{job.title}</span>
        <span className="row-meta">
          <span className="row-company">{job.company}</span>
          {job.location && <span className="row-loc">{job.location}</span>}
        </span>
        {(job.status !== "new" || job.closed || job.contacts > 0 || job.follow_up_at) && (
          <span className="row-flags">
            {job.status !== "new" && <StatusChip status={job.status} />}
            {job.closed && <span className="flag flag-closed">Closed</span>}
            {job.follow_up_at && (
              <span className={`flag${due ? " flag-due" : ""}`} title={`Follow up ${day(job.follow_up_at.slice(0, 10))}`}>
                <CalendarClock size={12} strokeWidth={1.75} />
                {due ? "Follow up due" : day(job.follow_up_at.slice(0, 10))}
              </span>
            )}
            {job.contacts > 0 && (
              <span className="flag" title={`${job.contacts} contact${job.contacts === 1 ? "" : "s"}`}>
                <Users size={12} strokeWidth={1.75} />
                {job.contacts}
              </span>
            )}
          </span>
        )}
      </span>
      <span className="row-side">
        {job.verdict && <ScoreBadge score={job.verdict.score} />}
        <span className="row-age" title={job.posted_at ? `Posted ${day(job.posted_at)}` : "No posting date"}>
          {age ?? "–"}
        </span>
      </span>
    </Link>
  );
}

function ListEmpty({ list, data, today, setList }: { list: ListState; data: ListJobsResult; today: Today | undefined; setList: (p: Partial<ListState>) => void }) {
  const narrowed = list.q || list.remote || list.posted !== "saved";
  if (narrowed)
    return (
      <Empty
        icon={<SearchX size={20} strokeWidth={1.5} />}
        title={list.q ? `Nothing matches “${list.q}”` : "Nothing matches these filters"}
        action={<Button onClick={() => setList({ q: "", remote: false, posted: "saved" })}>Clear search and filters</Button>}
      >
        {data.counts[list.view] > 0 ? `Try fewer words, or clear the search to see all ${data.counts[list.view].toLocaleString()}.` : "Try a broader search."}
      </Empty>
    );
  const noBoards = today?.setup.missing.some((m) => m.id === "sources");
  if (data.counts.all === 0 && noBoards)
    return (
      <Empty
        icon={<Inbox size={20} strokeWidth={1.5} />}
        title="Add where jobs come from"
        action={
          <Link to="/setup/sources" className="btn btn-primary btn-md">
            Add sources
          </Link>
        }
      >
        Hunt reads company job boards, remote job boards and RSS feeds you pick. Add a few companies, or import a starter list.
      </Empty>
    );
  if (data.counts.all === 0)
    return (
      <Empty icon={<Spinner />} title="Reading your sources">
        Hunt reads each source about every {today?.sources.pass_minutes ?? 60} minutes. Jobs that pass your filters land here.
      </Empty>
    );
  const meta = VIEW_META[list.view];
  return (
    <Empty icon={<Inbox size={20} strokeWidth={1.5} />} title={meta.empty}>
      {meta.hint}
    </Empty>
  );
}

function Skeleton() {
  return (
    <ul className="rows" aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <li key={i} className="row row-skeleton">
          <span className="row-main">
            <span className="sk sk-title" style={{ width: `${55 + ((i * 37) % 35)}%` }} />
            <span className="sk sk-meta" style={{ width: `${30 + ((i * 23) % 30)}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}
