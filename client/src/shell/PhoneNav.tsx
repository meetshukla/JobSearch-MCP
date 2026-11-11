import { useState, type ReactNode } from "react";
import { ChevronRight, Ellipsis, LogOut } from "lucide-react";
import { SETTINGS_SECTIONS, TAB_VIEWS, VIEWS, VIEW_ORDER } from "../model.ts";
import { plural } from "../format.ts";
import { Link, jobsPath, settingsPath, type Route } from "../router.tsx";
import { useAppData } from "../data.tsx";
import { Sheet } from "../overlay.tsx";
import { Segmented } from "../ui.tsx";
import { setTheme, THEMES, THEME_LABEL, useTheme } from "../theme.ts";
import { SourceHealth } from "./Sidebar.tsx";

/** The phone's top bar. Content scrolls under it. */
export function PhoneBar({ start, title, end, center }: { start?: ReactNode; title?: ReactNode; end?: ReactNode; center?: boolean }) {
  return (
    <header className="phone-bar" data-center={center || undefined}>
      <div className="phone-bar-start">{start}</div>
      <div className="phone-bar-title">{title}</div>
      <div className="phone-bar-end">{end}</div>
    </header>
  );
}

/** The three views in thumb reach, and More for settings. */
export function TabBar({ route }: { route: Route }) {
  const { counts, today } = useAppData();
  const [more, setMore] = useState(false);
  const inMore = route.page === "settings" || (route.page === "jobs" && !TAB_VIEWS.includes(route.view));
  return (
    <>
      <nav className="tabbar" aria-label="Views">
        {TAB_VIEWS.map((id) => {
          const v = VIEWS[id];
          const active = route.page === "jobs" && route.view === id;
          return (
            <Link key={id} to={jobsPath(id)} className="tab" aria-current={active ? "page" : undefined} aria-label={`${v.label}${v.count(counts, today) ? `, ${v.count(counts, today)}` : ""}`}>
              <span className="tab-icon">
                <v.icon size={20} strokeWidth={1.75} />
              </span>
              <span className="tab-label">{v.short}</span>
            </Link>
          );
        })}
        <button type="button" className="tab" aria-current={inMore ? "page" : undefined} aria-haspopup="dialog" onClick={() => setMore(true)}>
          <span className="tab-icon">
            <Ellipsis size={20} strokeWidth={1.75} />
          </span>
          <span className="tab-label">More</span>
        </button>
      </nav>
      <MoreSheet open={more} onOpenChange={setMore} />
    </>
  );
}

function MoreSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { counts, today, me, signOut } = useAppData();
  const theme = useTheme();
  const close = () => onOpenChange(false);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="More">
      {today && (
        <section className="sheet-section">
          <h2 className="sheet-heading">Today</h2>
          <p className="sheet-note">
            {today.new_24h ? `${plural(today.new_24h, "new job")} in the last day.` : "No new jobs in the last day."}
          </p>
          <div onClick={close}>
            <SourceHealth sources={today.sources} />
          </div>
        </section>
      )}
      <section className="sheet-section">
        <h2 className="sheet-heading">Settings</h2>
        <ul className="sheet-list">
          {SETTINGS_SECTIONS.map((s) => (
            <li key={s.id}>
              <Link to={settingsPath(s.id)} className="sheet-item" onClick={close}>
                <span className="sheet-item-label">{s.label}</span>
                {s.missing && today?.setup.missing.some((m) => m.id === s.missing) && <span className="nav-dot" aria-label="Needs setup" />}
                <ChevronRight size={16} strokeWidth={1.75} className="t3" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="sheet-section sheet-row">
        <h2 className="sheet-heading">Theme</h2>
        <Segmented label="Theme" value={theme} onChange={setTheme} options={THEMES.map((t) => ({ value: t, label: THEME_LABEL[t] }))} />
      </section>
      {!me.dev && (
        <section className="sheet-section">
          <button type="button" className="sheet-item" onClick={() => (close(), signOut())}>
            <LogOut size={18} strokeWidth={1.75} />
            <span className="sheet-item-label">Sign out</span>
          </button>
        </section>
      )}
    </Sheet>
  );
}
