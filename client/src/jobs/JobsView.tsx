import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { tool } from "../api.ts";
import { useLoad } from "../live.ts";
import { VIEWS, type JobGroup } from "../model.ts";
import { jobsPath, navigate, type ListQuery, type Route } from "../router.tsx";
import { SPLIT, shortcutBlocked, typing, useMedia } from "../ui.tsx";
import { ListPane } from "./ListPane.tsx";
import { JobDetail } from "./JobDetail.tsx";

type JobsRoute = Extract<Route, { page: "jobs" }>;

const PAGE = 50;
/** Where each list was scrolled to, so coming back from a job lands in the same place. */
const scrollMemory = new Map<string, number>();

export function JobsView({ route, phone }: { route: JobsRoute; phone: boolean }) {
  const { view, jobId, query } = route;
  const def = VIEWS[view];
  const split = useMedia(SPLIT) && !phone;
  const listKey = `${view}|${query.q}|${query.remote}|${query.posted}`;
  const [paged, setPaged] = useState({ key: listKey, limit: PAGE });
  const limit = paged.key === listKey ? paged.limit : PAGE;

  const list = useLoad(
    () =>
      tool("list_jobs", {
        view: def.server,
        query: query.q || undefined,
        remote_only: query.remote || undefined,
        ...(query.posted === "saved" ? {} : { posted_within_days: query.posted }),
        limit,
      }),
    `${listKey}|${limit}`,
    ["jobs", "settings"],
  );

  // Keep the rows on screen while the next page loads, so the list doesn't blank out.
  const last = useRef(list.data);
  if (list.data) last.current = list.data;
  const data = list.data ?? (limit > PAGE ? last.current : undefined);

  const groups = useMemo<JobGroup[] | undefined>(() => {
    if (!data) return undefined;
    return def.group ? def.group(data.jobs) : [{ key: "all", label: "", rows: data.jobs }];
  }, [data, def]);
  const ids = useMemo(() => groups?.flatMap((g) => g.rows.map((r) => r.id)) ?? [], [groups]);
  const total = data?.total;
  const more = data ? data.total - data.jobs.length : 0;

  const [cursor, setCursor] = useState<string | null>(jobId);
  useEffect(() => {
    if (jobId) setCursor(jobId);
  }, [jobId]);

  const setQuery = (patch: Partial<ListQuery>) => navigate(jobsPath(view, jobId, { ...query, ...patch }), { replace: true });
  const open = (id: string | null, replace = false) => navigate(jobsPath(view, id, query), { replace });
  const at = jobId ? ids.indexOf(jobId) : -1;
  // A status change can move the open job out of this view. j and k then continue from the place it left.
  const lastAt = useRef(-1);
  if (at >= 0) lastAt.current = at;
  const from = at >= 0 ? at : lastAt.current >= 0 ? lastAt.current - 0.5 : -1;
  const prevId = ids[Math.ceil(from) - 1];
  const nextId = ids[Math.floor(from) + 1];
  const step = (dir: 1 | -1) => {
    const next = dir > 0 ? nextId : prevId;
    if (next) open(next, true);
  };

  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && typing(document.activeElement)) {
        (document.activeElement as HTMLElement).blur();
        return;
      }
      if (shortcutBlocked(e)) return;
      if (e.key === "/") {
        e.preventDefault();
        search.current?.focus();
      } else if (e.key === "j" || e.key === "k" || e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!ids.length) return;
        e.preventDefault();
        const dir = e.key === "j" || e.key === "ArrowDown" ? 1 : -1;
        if (jobId) return step(dir);
        const from = cursor ? ids.indexOf(cursor) : -1;
        const next = ids[from < 0 ? 0 : Math.min(ids.length - 1, Math.max(0, from + dir))];
        setCursor(next);
        document.querySelector(`[data-job="${CSS.escape(next)}"]`)?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter" && !jobId && cursor && ids.includes(cursor)) {
        e.preventDefault();
        open(cursor);
      } else if (e.key === "Escape" && jobId) {
        e.preventDefault();
        open(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // On phones the window scrolls, elsewhere the list pane does. Either way, return to where the list was.
  const scroller = useRef<HTMLDivElement>(null);
  const showList = !jobId || split;
  const listShown = useRef(showList);
  listShown.current = showList;
  useLayoutEffect(() => {
    if (!showList) return;
    const y = scrollMemory.get(listKey) ?? 0;
    if (phone) window.scrollTo(0, y);
    else scroller.current?.scrollTo(0, y);
  }, [showList, listKey, phone]);
  useLayoutEffect(() => {
    if (jobId && phone) window.scrollTo(0, 0);
  }, [jobId, phone]);
  useEffect(() => {
    if (!showList) return;
    const el: HTMLElement | Window | null = phone ? window : scroller.current;
    const read = () => listShown.current && scrollMemory.set(listKey, phone ? window.scrollY : (scroller.current?.scrollTop ?? 0));
    el?.addEventListener("scroll", read, { passive: true });
    return () => el?.removeEventListener("scroll", read);
  }, [showList, listKey, phone]);

  const detail = jobId && (
    <JobDetail
      key={jobId}
      jobId={jobId}
      view={view}
      layout={phone ? "phone" : split ? "split" : "page"}
      onClose={() => open(null)}
      onStep={step}
      hasPrev={Boolean(prevId)}
      hasNext={Boolean(nextId)}
    />
  );
  if (jobId && !split) return detail;

  return (
    <div className="jobs" data-split={jobId ? "" : undefined}>
      <ListPane
        def={def}
        query={query}
        setQuery={setQuery}
        groups={groups}
        total={total}
        loading={list.loading}
        error={list.error}
        retry={list.reload}
        more={more}
        onMore={() => setPaged({ key: listKey, limit: limit + PAGE })}
        cursor={cursor}
        onCursor={setCursor}
        openId={jobId}
        compact={Boolean(jobId)}
        phone={phone}
        searchRef={search}
        scrollRef={scroller}
      />
      {detail}
    </div>
  );
}
