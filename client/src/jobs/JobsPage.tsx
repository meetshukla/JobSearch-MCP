import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { tool } from "../api.ts";
import { useLoad } from "../live.ts";
import { jobPath, navigate, type ListState, type Route } from "../router.tsx";
import { TodayStrip } from "./TodayStrip.tsx";
import { ListBar, ListRows } from "./JobList.tsx";
import { JobDetail } from "./JobDetail.tsx";

type JobsRoute = Extract<Route, { page: "jobs" }>;

const PAGE = 50;

const typing = (el: Element | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

export function JobsPage({ route }: { route: JobsRoute }) {
  const { list, jobId } = route;
  const listKey = `${list.view}|${list.q}|${list.remote}|${list.posted}`;
  const [paged, setPaged] = useState({ key: listKey, limit: PAGE });
  const limit = paged.key === listKey ? paged.limit : PAGE;

  const today = useLoad(() => tool("today", {}), "today", ["jobs", "sources", "settings"]);
  const settings = useLoad(() => tool("get_settings", {}), "settings", ["settings"]);
  const jobs = useLoad(
    () =>
      tool("list_jobs", {
        view: list.view,
        query: list.q || undefined,
        remote_only: list.remote || undefined,
        ...(list.posted === "saved" ? {} : { posted_within_days: list.posted }),
        limit,
      }),
    `${listKey}|${limit}`,
    ["jobs", "settings"],
  );

  // Keep showing the previous page's rows while "Show more" loads, so the list doesn't blank out.
  const lastJobs = useRef(jobs.data);
  if (jobs.data) lastJobs.current = jobs.data;
  const shown = jobs.data ?? (limit > PAGE ? lastJobs.current : undefined);

  const [cursor, setCursor] = useState<string | null>(jobId);
  useEffect(() => {
    if (jobId) setCursor(jobId);
  }, [jobId]);

  const ids = useMemo(() => shown?.jobs.map((j) => j.id) ?? [], [shown]);
  const setList = (patch: Partial<ListState>) => navigate(jobPath(jobId, { ...list, ...patch }), { replace: true });
  const open = (id: string | null) => navigate(jobPath(id, list));

  // On narrow screens the detail replaces the list in one scroller: start each job at the top, and come back to where the list was.
  const detailPane = useRef<HTMLElement>(null);
  const listScroll = useRef(0);
  const openRef = useRef(jobId);
  openRef.current = jobId;
  useEffect(() => {
    const m = document.getElementById("main");
    const onScroll = () => {
      if (!openRef.current && m) listScroll.current = m.scrollTop;
    };
    m?.addEventListener("scroll", onScroll, { passive: true });
    return () => m?.removeEventListener("scroll", onScroll);
  }, []);
  useLayoutEffect(() => {
    detailPane.current?.scrollTo(0, 0);
    const m = document.getElementById("main");
    if (m && matchMedia("(max-width: 880px)").matches) m.scrollTop = jobId ? 0 : listScroll.current;
  }, [jobId]);

  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (typing(document.activeElement)) {
        if (e.key === "Escape") (document.activeElement as HTMLElement).blur();
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        search.current?.focus();
      } else if (e.key === "j" || e.key === "k") {
        if (!ids.length) return;
        e.preventDefault();
        const at = cursor ? ids.indexOf(cursor) : -1;
        const next = at < 0 ? 0 : Math.min(ids.length - 1, Math.max(0, at + (e.key === "j" ? 1 : -1)));
        setCursor(ids[next]);
        document.querySelector(`[data-job="${CSS.escape(ids[next])}"]`)?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter" && cursor && ids.includes(cursor)) {
        e.preventDefault();
        open(cursor);
      } else if (e.key === "Escape" && jobId) {
        open(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="jobs" data-open={jobId ? "true" : "false"}>
      <TodayStrip today={today.data} onView={(view) => setList({ view })} />
      <ListBar list={list} counts={lastJobs.current?.counts} savedDays={settings.data?.filters.posted_within_days} setList={setList} searchRef={search} onTracked={open} />
      <div className="split">
        <ListRows
          list={list}
          data={shown}
          loading={jobs.loading}
          error={jobs.error}
          retry={jobs.reload}
          today={today.data}
          openId={jobId}
          cursor={cursor}
          onCursor={setCursor}
          setList={setList}
          onMore={() => setPaged({ key: listKey, limit: limit + PAGE })}
        />
        <section className="detail-pane" aria-label="Job" ref={detailPane}>
          {jobId ? <JobDetail key={jobId} jobId={jobId} onClose={() => open(null)} /> : ids.length > 0 && <NoJobSelected />}
        </section>
      </div>
    </div>
  );
}

function NoJobSelected() {
  return (
    <div className="detail-blank">
      <p className="detail-blank-title">Pick a job to read it here</p>
      <div className="shortcuts">
        <span>
          <kbd className="kbd">j</kbd>
          <kbd className="kbd">k</kbd> move
        </span>
        <span>
          <kbd className="kbd">↵</kbd> open
        </span>
        <span>
          <kbd className="kbd">/</kbd> search
        </span>
        <span>
          <kbd className="kbd">esc</kbd> close
        </span>
      </div>
    </div>
  );
}
