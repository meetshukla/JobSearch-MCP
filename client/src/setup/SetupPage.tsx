import { useLayoutEffect } from "react";
import { FileText, Plug, Rss, SlidersHorizontal } from "lucide-react";
import type { Me } from "../../../shared/types.ts";
import { tool } from "../api.ts";
import { useLoad } from "../live.ts";
import { Link, type SetupSection } from "../router.tsx";
import { Spinner } from "../ui.tsx";
import { Connect } from "./Connect.tsx";
import { Profile } from "./Profile.tsx";
import { FiltersForm } from "./FiltersForm.tsx";
import { Sources } from "./Sources.tsx";

const SECTIONS: { id: SetupSection; label: string; icon: typeof Plug }[] = [
  { id: "connect", label: "Connect your agent", icon: Plug },
  { id: "profile", label: "Profile", icon: FileText },
  { id: "filters", label: "Filters", icon: SlidersHorizontal },
  { id: "sources", label: "Sources", icon: Rss },
];

export function SetupPage({ me, section }: { me: Me; section: SetupSection }) {
  const settings = useLoad(() => tool("get_settings", {}), "settings", ["settings"]);
  useLayoutEffect(() => {
    document.getElementById("main")?.scrollTo(0, 0);
  }, [section]);
  return (
    <div className="setup">
      <nav className="setup-nav" aria-label="Setup">
        {SECTIONS.map((s) => (
          <Link key={s.id} to={`/setup/${s.id}`} replace className="setup-link" aria-current={s.id === section ? "page" : undefined}>
            <s.icon size={16} strokeWidth={1.75} />
            {s.label}
          </Link>
        ))}
      </nav>
      <div className="setup-body">
        {section === "connect" && <Connect me={me} />}
        {section === "sources" && <Sources me={me} />}
        {(section === "profile" || section === "filters") &&
          (settings.data ? (
            section === "profile" ? (
              <Profile saved={settings.data.profile} />
            ) : (
              <FiltersForm saved={settings.data.filters} defaults={settings.data.default_filters} />
            )
          ) : (
            <div className="setup-loading">{settings.error ?? <Spinner />}</div>
          ))}
      </div>
    </div>
  );
}

export function SectionHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="section-head">
      <h1>{title}</h1>
      {children && <p className="muted">{children}</p>}
    </header>
  );
}
