import { useEffect, useRef, useState, type RefObject } from "react";
import { Menu } from "@base-ui/react/menu";
import { Check, Inbox, ListFilter, Plus, Search, SearchX, X } from "lucide-react";
import type { ViewDef, JobGroup } from "../model.ts";
import { Link, jobsPath, settingsPath, type ListQuery, type Posted } from "../router.tsx";
import { useAppData } from "../data.tsx";
import { Mark, StatusGlyph } from "../glyphs.tsx";
import { MenuPopup } from "../overlay.tsx";
import { Button, Empty, IconButton, Keys, Spinner } from "../ui.tsx";
import { PhoneBar } from "../shell/PhoneNav.tsx";
import { JobRowLink } from "./JobRow.tsx";

type Props = {
  def: ViewDef;
  query: ListQuery;
  setQuery: (patch: Partial<ListQuery>) => void;
  groups: JobGroup[] | undefined;
  total: number | undefined;
  loading: boolean;
  error: string | null;
  retry: () => void;
  more: number;
  onMore: () => void;
  cursor: string | null;
  onCursor: (id: string) => void;
  openId: string | null;
  compact: boolean;
  phone: boolean;
  searchRef: RefObject<HTMLInputElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
};

export function ListPane(p: Props) {
  return (
    <section className="list-pane" aria-label={p.def.label} data-compact={p.compact || undefined}>
      {p.phone ? <PhoneHeader {...p} /> : <ViewHeader {...p} />}
      <div className="list-scroll" ref={p.scrollRef}>
        <Body {...p} />
      </div>
    </section>
  );
}

function ViewHeader({ def, total, query, setQuery, searchRef, compact }: Props) {
  return (
    <header className="view-header">
      <h1 className="view-title">
        <def.icon size={16} strokeWidth={1.75} />
        <span className="ellipsis">{def.label}</span>
        {total !== undefined && <span className="view-count tnum">{total.toLocaleString()}</span>}
      </h1>
      <div className="view-tools">
        <SearchField query={query} setQuery={setQuery} inputRef={searchRef} compact={compact} />
        <FilterMenu query={query} setQuery={setQuery} iconOnly={compact} />
      </div>
    </header>
  );
}

function PhoneHeader({ def, total, query, setQuery, searchRef }: Props) {
  const { openPalette } = useAppData();
  const [searching, setSearching] = useState(Boolean(query.q));
  if (searching) {
    return (
      <PhoneBar
        title={<SearchField query={query} setQuery={setQuery} inputRef={searchRef} autoFocus />}
        end={
          <Button variant="ghost" onClick={() => (setQuery({ q: "" }), setSearching(false))}>
            Cancel
          </Button>
        }
      />
    );
  }
  return (
    <PhoneBar
      start={
        <Link to={jobsPath("review")} className="phone-mark" aria-label="Hunt, to review">
          <Mark size={24} />
        </Link>
      }
      title={
        <h1 className="phone-title">
          <span className="ellipsis">{def.label}</span>
          {total !== undefined && <span className="view-count tnum">{total.toLocaleString()}</span>}
        </h1>
      }
      end={
        <>
          <IconButton icon={<Search size={20} strokeWidth={1.75} />} label="Search this view" onClick={() => setSearching(true)} />
          <FilterMenu query={query} setQuery={setQuery} iconOnly />
          <IconButton icon={<Plus size={20} strokeWidth={1.75} />} label="Track a job" onClick={() => openPalette("track")} />
        </>
      }
    />
  );
}

function SearchField({ query, setQuery, inputRef, compact, autoFocus }: { query: ListQuery; setQuery: (p: Partial<ListQuery>) => void; inputRef: RefObject<HTMLInputElement | null>; compact?: boolean; autoFocus?: boolean }) {
  const [q, setQ] = useState(query.q);
  useEffect(() => setQ(query.q), [query.q]);
  useEffect(() => {
    if (q.trim() === query.q) return;
    const t = setTimeout(() => setQuery({ q: q.trim() }), 180);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <label className="search" data-compact={compact || undefined}>
      <Search size={14} strokeWidth={1.75} className="search-icon" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        placeholder="Search"
        aria-label="Search title, company or place"
        value={q}
        autoFocus={autoFocus}
        enterKeyHint="search"
        autoComplete="off"
        onChange={(e) => setQ(e.target.value)}
      />
      {q ? (
        <button type="button" className="search-clear" onClick={() => (setQ(""), setQuery({ q: "" }))} aria-label="Clear search">
          <X size={14} strokeWidth={2} />
        </button>
      ) : (
        <Keys k="/" />
      )}
    </label>
  );
}

const POSTED: { value: Posted; label: (savedDays: number | null | undefined) => string }[] = [
  { value: "saved", label: (d) => (d == null ? "Your saved window (any age)" : `Your saved window (${d} days)`) },
  { value: 1, label: () => "Past 24 hours" },
  { value: 3, label: () => "Past 3 days" },
  { value: null, label: () => "Any age" },
];
const POSTED_SHORT: Record<string, string> = { "1": "24 hours", "3": "3 days", null: "Any age" };

function FilterMenu({ query, setQuery, iconOnly }: { query: ListQuery; setQuery: (p: Partial<ListQuery>) => void; iconOnly?: boolean }) {
  const { settings } = useAppData();
  const savedDays = settings?.filters.posted_within_days;
  const active = [query.remote && "Remote", query.posted !== "saved" && POSTED_SHORT[String(query.posted)]].filter(Boolean) as string[];
  const label = active.length ? active.join(", ") : "Filter";
  return (
    <Menu.Root>
      <Menu.Trigger
        className={`btn ${iconOnly ? "btn-ghost icon-only" : "btn-ghost has-icon"} filter-trigger`}
        data-active={active.length ? "" : undefined}
        aria-label={active.length ? `Filters: ${label}` : "Filter"}
      >
        <ListFilter size={iconOnly ? 18 : 14} strokeWidth={1.75} />
        {!iconOnly && <span>{label}</span>}
        {iconOnly && active.length > 0 && <span className="filter-dot" aria-hidden />}
      </Menu.Trigger>
      <MenuPopup align="end">
        <Menu.CheckboxItem className="menu-item" checked={query.remote} onCheckedChange={(v) => setQuery({ remote: v })} closeOnClick>
          <span className="menu-check">{query.remote && <Check size={14} strokeWidth={2} />}</span>
          Remote only
        </Menu.CheckboxItem>
        <Menu.Separator className="menu-sep" />
        <Menu.Group>
          <Menu.GroupLabel className="menu-label">Posted within</Menu.GroupLabel>
          <Menu.RadioGroup value={String(query.posted)} onValueChange={(v: string) => setQuery({ posted: POSTED.find((o) => String(o.value) === v)!.value })}>
            {POSTED.map((o) => (
              <Menu.RadioItem key={String(o.value)} value={String(o.value)} className="menu-item" closeOnClick>
                <span className="menu-check">
                  <Menu.RadioItemIndicator>
                    <Check size={14} strokeWidth={2} />
                  </Menu.RadioItemIndicator>
                </span>
                {o.label(savedDays)}
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </Menu.Group>
        {active.length > 0 && (
          <>
            <Menu.Separator className="menu-sep" />
            <Menu.Item className="menu-item" onClick={() => setQuery({ remote: false, posted: "saved" })}>
              <span className="menu-check" />
              Clear filters
            </Menu.Item>
          </>
        )}
      </MenuPopup>
    </Menu.Root>
  );
}

function Body(p: Props) {
  const { groups, error, retry, more, loading, onMore } = p;
  const sentinel = useRef<HTMLDivElement>(null);
  const moreRef = useRef({ more, loading, onMore });
  moreRef.current = { more, loading, onMore };
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      const m = moreRef.current;
      if (entries.some((e) => e.isIntersecting) && m.more > 0 && !m.loading) m.onMore();
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [groups !== undefined]);

  if (!groups) {
    if (error)
      return (
        <Empty title="Couldn't load jobs" action={<Button onClick={retry}>Try again</Button>}>
          {error}
        </Empty>
      );
    return <Skeleton />;
  }
  if (!groups.some((g) => g.rows.length)) return <ListEmpty {...p} />;
  return (
    <>
      <div className="list" aria-busy={loading || undefined}>
        {groups.map((g, i) => (
          <section key={g.key} className="group" aria-label={g.label || undefined}>
            {g.label && (
              <h2 className="group-head">
                {g.status && <StatusGlyph status={g.status} />}
                <span>{g.label}</span>
                {(i < groups.length - 1 || more === 0) && <span className="group-count tnum">{g.rows.length.toLocaleString()}</span>}
              </h2>
            )}
            <ul className="rows">
              {g.rows.map((j) => (
                <li key={j.id}>
                  <JobRowLink job={j} view={p.def.id} query={p.query} open={j.id === p.openId} cursor={j.id === p.cursor} onFocus={() => p.onCursor(j.id)} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div ref={sentinel} className="list-end">
        {more > 0 && (
          <Button variant="ghost" onClick={onMore} busy={loading}>
            Show {Math.min(50, more)} more of {more.toLocaleString()}
          </Button>
        )}
      </div>
    </>
  );
}

function ListEmpty({ def, query, setQuery }: Props) {
  const { counts, today } = useAppData();
  const narrowed = query.q || query.remote || query.posted !== "saved";
  if (narrowed)
    return (
      <Empty
        icon={<SearchX size={20} strokeWidth={1.5} />}
        title={query.q ? `Nothing matches “${query.q}”` : "Nothing matches these filters"}
        action={<Button onClick={() => setQuery({ q: "", remote: false, posted: "saved" })}>Clear search and filters</Button>}
      >
        Try fewer words, or a wider posting window.
      </Empty>
    );
  const noSources = today?.setup.missing.some((m) => m.id === "sources");
  if (counts?.all === 0 && noSources)
    return (
      <Empty
        icon={<Inbox size={20} strokeWidth={1.5} />}
        title="Add where jobs come from"
        action={
          <Link to={settingsPath("sources")} className="btn btn-primary">
            Add sources
          </Link>
        }
      >
        Hunt reads company job boards, remote job boards and RSS feeds you pick. Add a few companies, or import a starter list.
      </Empty>
    );
  if (counts?.all === 0)
    return (
      <Empty icon={<Spinner />} title="Reading your sources">
        Hunt reads each source about every {today?.sources.pass_minutes ?? 60} minutes. Jobs that pass your filters land here.
      </Empty>
    );
  const shortlist = counts?.shortlist ?? 0;
  return (
    <Empty
      icon={<def.icon size={20} strokeWidth={1.5} />}
      title={def.empty.title}
      action={
        def.id === "review" && shortlist > 0 ? (
          <Link to={jobsPath("shortlist")} className="btn btn-secondary">
            Open the shortlist ({shortlist})
          </Link>
        ) : undefined
      }
    >
      {def.empty.text}
    </Empty>
  );
}

function Skeleton() {
  return (
    <ul className="rows skeleton" aria-label="Loading jobs">
      {Array.from({ length: 10 }, (_, i) => (
        <li key={i} className="row row-skeleton" aria-hidden>
          <span className="row-glyph">
            <span className="sk sk-dot" />
          </span>
          <span className="row-title">
            <span className="sk" style={{ width: `${48 + ((i * 37) % 38)}%` }} />
          </span>
          <span className="row-sub">
            <span className="sk" style={{ width: `${30 + ((i * 23) % 30)}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

