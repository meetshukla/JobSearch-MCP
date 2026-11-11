import { useLayoutEffect, useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SETTINGS_SECTIONS, type SettingsSection } from "../model.ts";
import { Link, settingsPath } from "../router.tsx";
import { useAppData } from "../data.tsx";
import { Spinner } from "../ui.tsx";
import { PhoneBar } from "../shell/PhoneNav.tsx";
import { Connect } from "./Connect.tsx";
import { Profile } from "./Profile.tsx";
import { Filters } from "./Filters.tsx";
import { Sources } from "./Sources.tsx";

export function SettingsView({ section, phone }: { section: SettingsSection | null; phone: boolean }) {
  const { me, settings, today } = useAppData();
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    scroller.current?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }, [section]);

  if (!section) {
    if (!phone) return null;
    const missing = today?.setup.missing ?? [];
    return (
      <div className="settings">
        <PhoneBar title={<h1 className="phone-title">Settings</h1>} />
        <ul className="sheet-list settings-index">
          {SETTINGS_SECTIONS.map((s) => (
            <li key={s.id}>
              <Link to={settingsPath(s.id)} className="sheet-item">
                <span className="sheet-item-label">{s.label}</span>
                {s.missing && missing.some((m) => m.id === s.missing) && <span className="nav-dot" aria-label="Needs setup" />}
                <ChevronRight size={16} strokeWidth={1.75} className="t3" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const label = SETTINGS_SECTIONS.find((s) => s.id === section)!.label;
  const wait = <div className="settings-loading">{settings ? null : <Spinner />}</div>;
  return (
    <div className="settings">
      {phone && (
        <PhoneBar
          start={
            <Link to={settingsPath()} className="back-btn">
              <ChevronLeft size={22} strokeWidth={1.75} />
              Settings
            </Link>
          }
          title={<span className="phone-title">{label}</span>}
          center
        />
      )}
      <div className="settings-scroll" ref={scroller}>
        <div className="settings-page" data-wide={section === "sources" || undefined}>
          {section === "connect" && <Connect me={me} />}
          {section === "profile" && (settings ? <Profile saved={settings.profile} /> : wait)}
          {section === "filters" && (settings ? <Filters saved={settings.filters} defaults={settings.default_filters} /> : wait)}
          {section === "sources" && <Sources me={me} />}
        </div>
      </div>
    </div>
  );
}

export function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="page-head">
      <h1 className="page-title">{title}</h1>
      {children && <p className="page-desc">{children}</p>}
    </header>
  );
}

export function Section({ title, description, children, id }: { title: string; description?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="set-section" aria-labelledby={id}>
      <div className="set-section-head">
        <h2 className="set-section-title" id={id}>
          {title}
        </h2>
        {description && <p className="set-section-desc">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** One setting: its label and help on the leading side, the control on the trailing side. Stacks on narrow screens. */
export function Row({ label, help, htmlFor, children, stack, disabled }: { label: string; help?: ReactNode; htmlFor?: string; children: ReactNode; stack?: boolean; disabled?: boolean }) {
  return (
    <div className="set-row" data-stack={stack || undefined} data-disabled={disabled || undefined}>
      <div className="set-row-text">
        <label className="set-row-label" htmlFor={htmlFor}>
          {label}
        </label>
        {help && <p className="help">{help}</p>}
      </div>
      <div className="set-row-control">{children}</div>
    </div>
  );
}
