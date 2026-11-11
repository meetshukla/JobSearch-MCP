import { ArrowLeft, LogOut, Monitor, Moon, Plus, Search, Settings, Sun } from "lucide-react";
import type { Today } from "../../../shared/types.ts";
import { Mark } from "../glyphs.tsx";
import { SETTINGS_SECTIONS, VIEWS, VIEW_ORDER } from "../model.ts";
import { ago, plural } from "../format.ts";
import { Link, jobsPath, settingsPath, type Route } from "../router.tsx";
import { useAppData } from "../data.tsx";
import { IconButton, Keys } from "../ui.tsx";
import { cycleTheme, THEME_LABEL, useTheme } from "../theme.ts";

const THEME_ICON = { system: Monitor, light: Sun, dark: Moon };

export function Sidebar({ route }: { route: Route }) {
  return <nav className="sidebar" aria-label="Hunt">{route.page === "settings" ? <SettingsNav route={route} /> : <AppNav route={route} />}</nav>;
}

function AppNav({ route }: { route: Route }) {
  const { counts, today, openPalette } = useAppData();
  const due = today?.follow_ups_due.length ?? 0;
  return (
    <>
      <div className="sidebar-head">
        <Link to={jobsPath("review")} className="brand">
          <Mark />
          <span>Hunt</span>
        </Link>
        <IconButton icon={<Search size={16} strokeWidth={1.75} />} label="Search and commands" keys="⌘ K" onClick={() => openPalette("all")} />
        <IconButton icon={<Plus size={16} strokeWidth={1.75} />} label="Track a job" keys="T" onClick={() => openPalette("track")} />
      </div>
      <ul className="nav">
        {VIEW_ORDER.map((id) => {
          const v = VIEWS[id];
          const n = v.count(counts, today);
          const active = route.page === "jobs" && route.view === id;
          return (
            <li key={id}>
              <Link to={jobsPath(id)} className="nav-item" aria-current={active ? "page" : undefined}>
                <v.icon size={16} strokeWidth={1.75} />
                <span className="nav-label">{v.label}</span>
                {n ? (
                  <span className="nav-count tnum" data-due={id === "follow_ups" && due > 0 ? "" : undefined}>
                    {n.toLocaleString()}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
      <Footer today={today} />
    </>
  );
}

function Footer({ today }: { today: Today | undefined }) {
  const { me, signOut } = useAppData();
  const theme = useTheme();
  const ThemeIcon = THEME_ICON[theme];
  const missing = today?.setup.missing ?? [];
  const next = SETTINGS_SECTIONS.find((s) => s.missing && missing.some((m) => m.id === s.missing));
  return (
    <div className="sidebar-foot">
      {next && (
        <Link to={settingsPath(next.id)} className="setup-nudge">
          <span className="setup-nudge-title">Finish setting up</span>
          <span className="t3">{plural(missing.length, "step")} left</span>
        </Link>
      )}
      {today && <SourceHealth sources={today.sources} />}
      <div className="sidebar-row">
        <Link to={settingsPath("connect")} className="nav-item nav-item-grow">
          <Settings size={16} strokeWidth={1.75} />
          <span className="nav-label">Settings</span>
        </Link>
        <IconButton icon={<ThemeIcon size={16} strokeWidth={1.75} />} label={`Theme: ${THEME_LABEL[theme]}`} onClick={cycleTheme} tipSide="top" />
        {!me.dev && <IconButton icon={<LogOut size={16} strokeWidth={1.75} />} label="Sign out" onClick={signOut} tipSide="top" />}
      </div>
      {me.dev && (
        <p className="local-mode" title="DEV_NO_AUTH is on: no sign-in, everything is open.">
          Local mode, no sign-in
        </p>
      )}
    </div>
  );
}

export function SourceHealth({ sources }: { sources: Today["sources"] }) {
  const total = sources.active + sources.queued + sources.errors + sources.paused;
  // A few failing boards out of hundreds is normal. The dot turns red only when most sources fail.
  const tone = sources.errors > sources.active ? "error" : sources.active ? "ok" : "idle";
  return (
    <Link to={sources.errors ? `${settingsPath("sources")}?state=error` : settingsPath("sources")} className="health" data-tone={tone}>
      <span className="health-line">
        <span className="health-dot" aria-hidden />
        <span className="nav-label">{total ? plural(total, "source") : "No sources yet"}</span>
      </span>
      <span className="health-sub">
        {sources.errors > 0 && <span className="health-err">{sources.errors.toLocaleString()} failing</span>}
        <span>{sources.last_read_at ? `Read ${ago(sources.last_read_at)}` : total ? "Not read yet" : "Add a few to start"}</span>
      </span>
    </Link>
  );
}

function SettingsNav({ route }: { route: Extract<Route, { page: "settings" }> }) {
  const { today, openShortcuts } = useAppData();
  const missing = today?.setup.missing ?? [];
  return (
    <>
      <div className="sidebar-head">
        <Link to={jobsPath("review")} className="back-link">
          <ArrowLeft size={16} strokeWidth={1.75} />
          Back to jobs
        </Link>
      </div>
      <p className="nav-section">Settings</p>
      <ul className="nav">
        {SETTINGS_SECTIONS.map((s) => (
          <li key={s.id}>
            <Link to={settingsPath(s.id)} replace className="nav-item" aria-current={route.section === s.id ? "page" : undefined}>
              <span className="nav-label">{s.label}</span>
              {s.missing && missing.some((m) => m.id === s.missing) && <span className="nav-dot" aria-label="Needs setup" />}
            </Link>
          </li>
        ))}
      </ul>
      <div className="sidebar-foot">
        <button type="button" className="nav-item" onClick={openShortcuts}>
          <span className="nav-label">Keyboard shortcuts</span>
          <Keys k="?" />
        </button>
      </div>
    </>
  );
}
