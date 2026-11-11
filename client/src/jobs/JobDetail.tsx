import { AlertTriangle, ArrowLeft, ArrowUpRight, Building2, Clock, DollarSign, MapPin, Radio, X } from "lucide-react";
import type { JobDetail as Job, Status } from "../../../shared/types.ts";
import { STATUSES } from "../../../shared/types.ts";
import { tool } from "../api.ts";
import { bump, useLoad } from "../live.ts";
import { STATUS, ago, fullDate } from "../format.ts";
import { Link } from "../router.tsx";
import { Button, Empty, Spinner, toast } from "../ui.tsx";
import { VerdictCard } from "./VerdictCard.tsx";
import { FollowUp } from "./FollowUp.tsx";
import { Contacts } from "./Contacts.tsx";
import { Activity } from "./Activity.tsx";
import { Description } from "./Description.tsx";

export type JobUpdate = Omit<Parameters<typeof tool<"update_job">>[1], "job_id">;
export type SaveJob = (update: JobUpdate, optimistic?: (j: Job) => Job) => Promise<boolean>;

const SOURCE_LABEL: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  smartrecruiters: "SmartRecruiters",
  workable: "Workable",
  recruitee: "Recruitee",
  workday: "Workday",
  remotive: "Remotive",
  himalayas: "Himalayas",
  jobicy: "Jobicy",
  weworkremotely: "We Work Remotely",
  arbeitnow: "Arbeitnow",
  feed: "RSS feed",
  link: "a link you added",
};

export function JobDetail({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const job = useLoad(() => tool("get_job", { job_id: jobId, html: true }), jobId, ["job", "settings"]);

  const save: SaveJob = async (update, optimistic) => {
    if (optimistic) job.set(optimistic);
    try {
      const next = await tool("update_job", { job_id: jobId, ...update });
      // update_job returns the job without its description; keep the one we have.
      job.set((cur) => ({ ...next, description: cur.description, description_html: cur.description_html }));
      bump(["jobs"]);
      return true;
    } catch (e) {
      toast((e as Error).message, "error");
      job.reload();
      return false;
    }
  };

  if (!job.data) {
    return (
      <div className="detail">
        <DetailBar onClose={onClose} />
        {job.error ? (
          <Empty title="Couldn't open this job" action={<Button onClick={job.reload}>Try again</Button>}>
            {job.error}
          </Empty>
        ) : (
          <div className="detail-loading">
            <Spinner />
          </div>
        )}
      </div>
    );
  }

  const j = job.data;
  return (
    <article className="detail">
      <DetailBar onClose={onClose} />
      <header className="detail-head">
        <p className="detail-company">
          {j.company}
          {j.department && <span className="muted"> · {j.department}</span>}
        </p>
        <h1 className="detail-title">{j.title.trim()}</h1>
        <ul className="facts">
          {j.location && (
            <li>
              <MapPin size={14} strokeWidth={1.75} />
              {j.location}
            </li>
          )}
          {j.remote && !/remote/i.test(j.location) && (
            <li>
              <Radio size={14} strokeWidth={1.75} />
              Remote
            </li>
          )}
          {j.salary && (
            <li>
              <DollarSign size={14} strokeWidth={1.75} />
              {j.salary}
            </li>
          )}
          <li title={j.posted_at ? fullDate(j.posted_at) : undefined}>
            <Clock size={14} strokeWidth={1.75} />
            {j.posted_at ? `Posted ${ago(j.posted_at)}` : `Found ${ago(j.first_seen_at)}, no posting date`}
          </li>
          <li>
            <Building2 size={14} strokeWidth={1.75} />
            via {SOURCE_LABEL[j.source] ?? j.source}
          </li>
          {j.closed && <li className="fact-closed">Closed</li>}
        </ul>
        <div className="detail-actions">
          <a className="btn btn-primary btn-md has-icon open-posting" href={j.apply_url} target="_blank" rel="noopener noreferrer">
            Open posting
            <ArrowUpRight size={16} strokeWidth={2} />
          </a>
          <StatusControl status={j.status} onChange={(status) => save({ status }, (cur) => ({ ...cur, status }))} />
        </div>
      </header>

      {!j.filter.ok && j.filter.reason && (
        <div className="banner" role="note">
          <AlertTriangle size={16} strokeWidth={1.75} />
          <p>
            <strong>Outside your filters.</strong> {j.filter.reason}.{" "}
            {!j.closed && (
              <Link to="/setup/filters" className="link">
                Edit filters
              </Link>
            )}
          </p>
        </div>
      )}

      <div className="detail-grid">
        <aside className="detail-aside">
          <VerdictCard job={j} save={save} />
          <FollowUp job={j} save={save} />
          <Contacts job={j} save={save} />
        </aside>
        <div className="detail-main">
          <Description html={j.description_html} text={j.description} />
          <Activity job={j} save={save} />
        </div>
      </div>
    </article>
  );
}

function DetailBar({ onClose }: { onClose: () => void }) {
  return (
    <div className="detail-bar">
      <Button variant="ghost" size="sm" icon={<ArrowLeft size={16} strokeWidth={1.75} />} onClick={onClose} className="detail-back">
        Jobs
      </Button>
      <Button variant="ghost" size="sm" icon={<X size={16} strokeWidth={1.75} />} onClick={onClose} aria-label="Close" title="Close (esc)" className="detail-close" />
    </div>
  );
}

function StatusControl({ status, onChange }: { status: Status; onChange: (s: Status) => void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Status">
      {STATUSES.map((s) => (
        <button key={s} type="button" role="radio" aria-checked={s === status} className={`seg seg-${STATUS[s].tone}`} onClick={() => s !== status && onChange(s)}>
          {STATUS[s].action}
        </button>
      ))}
    </div>
  );
}
