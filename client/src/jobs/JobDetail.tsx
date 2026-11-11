import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { AlertTriangle, ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, X } from "lucide-react";
import type { JobDetail as Job, Status } from "../../../shared/types.ts";
import { tool } from "../api.ts";
import { bump, useLoad } from "../live.ts";
import { STATUS_LABEL, VIEWS, type ViewId } from "../model.ts";
import { Link, settingsPath } from "../router.tsx";
import { setActiveJob } from "../data.tsx";
import { Button, Empty, IconButton, Tip, shortcutBlocked } from "../ui.tsx";
import { toast } from "../toast.tsx";
import { PhoneBar } from "../shell/PhoneNav.tsx";
import { Properties, StatusMenu } from "./Properties.tsx";
import { Description } from "./Description.tsx";
import { Contacts } from "./Contacts.tsx";
import { Activity } from "./Activity.tsx";

type JobUpdate = Omit<Parameters<typeof tool<"update_job">>[1], "job_id">;
export type SaveJob = (update: JobUpdate, optimistic?: (j: Job) => Job) => Promise<boolean>;
type Layout = "split" | "page" | "phone";

type Props = { jobId: string; view: ViewId; layout: Layout; onClose: () => void; onStep: (dir: 1 | -1) => void; hasPrev: boolean; hasNext: boolean };

export function JobDetail({ jobId, view, layout, onClose, onStep, hasPrev, hasNext }: Props) {
  const job = useLoad(() => tool("get_job", { job_id: jobId, html: true }), jobId, ["job", "settings"]);
  const [statusOpen, setStatusOpen] = useState(false);
  const note = useRef<HTMLTextAreaElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const wide = useWidth(body) >= 720 && layout !== "phone";
  const j = job.data;
  // Beside a list, the view title is the page heading. On its own, the job title is.
  const Title = layout === "split" ? "h2" : "h1";

  const save: SaveJob = async (update, optimistic) => {
    if (optimistic) job.set(optimistic);
    try {
      const next = await tool("update_job", { job_id: jobId, ...update });
      // update_job returns the job without its description, so keep the one on screen.
      job.set((cur) => ({ ...next, description: cur.description, description_html: cur.description_html }));
      bump(["jobs"]);
      return true;
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
      job.reload();
      return false;
    }
  };

  const setStatus = (s: Status) => {
    if (!j || s === j.status) return;
    const prev = j.status;
    save({ status: s }, (cur) => ({ ...cur, status: s })).then(
      (ok) => ok && toast(`Marked ${STATUS_LABEL[s].toLowerCase()}`, { action: { label: "Undo", run: () => void save({ status: prev }, (cur) => ({ ...cur, status: prev })) } }),
    );
  };

  useEffect(() => {
    if (j) setActiveJob({ id: j.id, title: j.title, company: j.company, status: j.status, applyUrl: j.apply_url, setStatus, focusNote: () => note.current?.focus() });
  });
  useEffect(() => () => setActiveJob(null), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!j || shortcutBlocked(e)) return;
      const k = e.key.toLowerCase();
      if (k === "s") setStatusOpen(true);
      else if (k === "o") window.open(j.apply_url, "_blank", "noopener,noreferrer");
      else if (k === "n") note.current?.focus();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const props = j && (
    <Properties job={j} save={save} setStatus={setStatus} statusOpen={statusOpen} setStatusOpen={setStatusOpen} />
  );

  return (
    <section className="detail" data-layout={layout} aria-label={j ? `${j.title} at ${j.company}` : "Job"}>
      {layout === "phone" ? (
        <PhoneBar
          start={
            <button type="button" className="back-btn" onClick={onClose}>
              <ChevronLeft size={22} strokeWidth={1.75} />
              <span className="ellipsis">{VIEWS[view].label}</span>
            </button>
          }
          end={<StepButtons onStep={onStep} hasPrev={hasPrev} hasNext={hasNext} />}
        />
      ) : (
        <div className="detail-bar">
          {layout === "page" ? (
            <nav className="crumbs" aria-label="Breadcrumb">
              <button type="button" className="crumb-back" onClick={onClose}>
                <ChevronLeft size={16} strokeWidth={1.75} />
                {VIEWS[view].label}
              </button>
              {j && <ChevronRight size={14} strokeWidth={1.75} className="crumb-sep" aria-hidden />}
              {j && <span className="crumb-current ellipsis">{j.company}</span>}
            </nav>
          ) : (
            <span className="crumbs crumb-current ellipsis">{j?.company}</span>
          )}
          <div className="detail-bar-end">
            <StepButtons onStep={onStep} hasPrev={hasPrev} hasNext={hasNext} />
            {j && (
              <Tip label="Open posting" keys="O">
                <a className="btn btn-ghost icon-only" href={j.apply_url} target="_blank" rel="noopener noreferrer" aria-label="Open posting">
                  <ArrowUpRight size={16} strokeWidth={1.75} />
                </a>
              </Tip>
            )}
            {layout === "split" && <IconButton icon={<X size={16} strokeWidth={1.75} />} label="Close" keys="Esc" onClick={onClose} />}
          </div>
        </div>
      )}
      <div className="detail-scroll" ref={body}>
        {!j ? (
          job.error ? (
            <Empty title="Couldn't open this job" action={<Button onClick={job.reload}>Try again</Button>}>
              {job.error}
            </Empty>
          ) : (
            <DetailSkeleton />
          )
        ) : (
          <div className="detail-body" data-wide={wide || undefined}>
            <div className="detail-main">
              <header className="detail-head">
                <p className="detail-company">
                  {j.company}
                  {j.department && <span className="t3"> {j.department}</span>}
                </p>
                <Title className="detail-title">{j.title.trim()}</Title>
              </header>
              {!wide && props}
              {!j.filter.ok && j.filter.reason && (
                <p className="filter-note" role="note">
                  <AlertTriangle size={14} strokeWidth={1.75} aria-hidden />
                  <span>
                    Outside your filters. {j.filter.reason}.{" "}
                    {!j.closed && (
                      <Link to={settingsPath("filters")} className="link">
                        Edit filters
                      </Link>
                    )}
                  </span>
                </p>
              )}
              <Description html={j.description_html} text={j.description} url={j.apply_url} />
              <Contacts job={j} save={save} />
              <Activity job={j} save={save} noteRef={note} />
            </div>
            {wide && <aside className="detail-side">{props}</aside>}
          </div>
        )}
      </div>
      {layout === "phone" && j && (
        <div className="phone-actions">
          <StatusMenu status={j.status} closed={j.closed} onChange={setStatus} side="top" trigger="button" />
          <a className="btn btn-primary has-icon" href={j.apply_url} target="_blank" rel="noopener noreferrer">
            Open posting
            <ArrowUpRight size={16} strokeWidth={1.75} />
          </a>
        </div>
      )}
    </section>
  );
}

function StepButtons({ onStep, hasPrev, hasNext }: { onStep: (d: 1 | -1) => void; hasPrev: boolean; hasNext: boolean }) {
  return (
    <>
      <IconButton icon={<ChevronUp size={16} strokeWidth={1.75} />} label="Previous job" keys="K" disabled={!hasPrev} onClick={() => onStep(-1)} />
      <IconButton icon={<ChevronDown size={16} strokeWidth={1.75} />} label="Next job" keys="J" disabled={!hasNext} onClick={() => onStep(1)} />
    </>
  );
}

function DetailSkeleton() {
  return (
    <div className="detail-body" aria-label="Loading job">
      <div className="detail-main">
        <span className="sk" style={{ width: 120 }} />
        <span className="sk sk-title" style={{ width: "70%" }} />
        <span className="sk" style={{ width: "92%", marginTop: 32 }} />
        <span className="sk" style={{ width: "86%" }} />
        <span className="sk" style={{ width: "90%" }} />
        <span className="sk" style={{ width: "60%" }} />
      </div>
    </div>
  );
}

function useWidth(ref: RefObject<HTMLElement | null>) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}
