import { ArrowRight, CalendarClock, Check } from "lucide-react";
import type { Today, View } from "../../../shared/types.ts";
import { ago, day, plural } from "../format.ts";
import { Link } from "../router.tsx";

type Stat = { label: string; value: number; view?: View; sub?: string; tone?: "accent" };

export function TodayStrip({ today, onView }: { today: Today | undefined; onView: (v: View) => void }) {
  if (!today) return <div className="today today-loading" aria-hidden />;
  const { jobs, follow_ups_due: due, sources } = today;
  const stats: Stat[] = [
    { label: "New today", value: jobs.new_24h },
    { label: "To review", value: jobs.to_review, view: "to_review" },
    { label: "Shortlist", value: jobs.shortlist, view: "shortlist" },
    { label: "Applied", value: jobs.applied + jobs.in_process, view: "applied", sub: jobs.in_process ? `${jobs.in_process} in process` : undefined },
    { label: "Follow-ups due", value: due.length, tone: due.length ? "accent" : undefined },
  ];
  const sourceCount = sources.active + sources.queued + sources.errors;
  return (
    <>
      <div className="today">
        <div className="stats">
          {stats.map((s) => {
            const body = (
              <>
                <span className="stat-value" data-tone={s.tone}>
                  {s.value.toLocaleString()}
                </span>
                <span className="stat-label">
                  {s.label}
                  {s.sub && <span className="stat-sub"> · {s.sub}</span>}
                </span>
              </>
            );
            return s.view ? (
              <button key={s.label} type="button" className="stat stat-link" onClick={() => onView(s.view!)} aria-label={`${s.label}: ${s.value}. Show them`}>
                {body}
              </button>
            ) : (
              <div key={s.label} className="stat">
                {body}
              </div>
            );
          })}
        </div>
        <div className="today-end">
          <Chart days={today.days} />
          <Link to="/setup/sources" className="sources-pill" title={sources.last_read_at ? `Last read ${ago(sources.last_read_at)}` : "Not read yet"}>
            <span className={`pulse-dot${sources.errors ? " has-errors" : ""}`} />
            {plural(sourceCount, "source")}
            {sources.errors > 0 && <span className="pill-warn">{sources.errors} failing</span>}
            {sources.last_read_at && <span className="muted">· read {ago(sources.last_read_at)}</span>}
          </Link>
        </div>
      </div>
      {!today.setup.ready && <SetupChecklist missing={today.setup.missing} />}
      {due.length > 0 && (
        <div className="due-row">
          <CalendarClock size={14} strokeWidth={1.75} />
          <span className="due-label">Follow up</span>
          <div className="due-list">
            {due.map((d) => (
              <Link key={d.id} to={`/jobs/${encodeURIComponent(d.id)}`} className="due-item">
                <span className="due-company">{d.company}</span>
                <span className="due-title">{d.title}</span>
                <span className="due-date">{day(d.follow_up_at.slice(0, 10))}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function Chart({ days }: { days: Today["days"] }) {
  const max = Math.max(1, ...days.map((d) => d.jobs));
  const total = days.reduce((n, d) => n + d.jobs, 0);
  return (
    <figure className="chart" aria-label={`${total} jobs found in the last 14 days`}>
      <div className="bars">
        {days.map((d, i) => (
          <span key={d.day} className="bar-slot" title={`${day(d.day)}: ${plural(d.jobs, "job")}`}>
            <span className={`bar${i === days.length - 1 ? " bar-today" : ""}${d.jobs === 0 ? " bar-zero" : ""}`} style={{ height: d.jobs ? `${Math.max(12, (d.jobs / max) * 100)}%` : undefined }} />
          </span>
        ))}
      </div>
      <figcaption>
        <span className="tnum">{total.toLocaleString()}</span> found in 14 days
      </figcaption>
    </figure>
  );
}

type Missing = Today["setup"]["missing"];

const STEPS: { id: Missing[number]["id"]; label: string; detail: string; to: string }[] = [
  { id: "profile", label: "Add your profile", detail: "Your resume and what you want, for your agent to judge fit.", to: "/setup/profile" },
  { id: "sources", label: "Add company job boards", detail: "Company names, careers pages, or a starter list.", to: "/setup/sources" },
  { id: "where", label: "Say where you can work", detail: "Places for on-site jobs and regions for remote ones.", to: "/setup/filters" },
];

function SetupChecklist({ missing }: { missing: Missing }) {
  const unknown = missing.filter((m) => !STEPS.some((s) => s.id === m.id));
  return (
    <section className="checklist" aria-label="Finish setting up">
      <div className="checklist-head">
        <p className="checklist-title">Finish setting up</p>
        <p className="muted">Three things make Hunt useful. Each one takes a minute.</p>
      </div>
      <ol className="checklist-items">
        {STEPS.map((s) => {
          const done = !missing.some((m) => m.id === s.id);
          return (
            <li key={s.id} data-done={done}>
              <Link to={s.to} className="check-item">
                <span className="check-box">{done && <Check size={12} strokeWidth={2.5} />}</span>
                <span className="check-text">
                  <span className="check-label">{s.label}</span>
                  <span className="check-detail">{s.detail}</span>
                </span>
                {!done && <ArrowRight size={14} strokeWidth={1.75} className="check-go" />}
              </Link>
            </li>
          );
        })}
      </ol>
      {unknown.map((m) => (
        <p key={m.id} className="muted">
          {m.text}
        </p>
      ))}
    </section>
  );
}
