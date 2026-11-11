import { useCallback, useEffect, useState } from "react";
import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import type { Me } from "../../shared/types.ts";
import { api, setUnauthorizedHandler } from "./api.ts";
import { startPulse } from "./live.ts";
import { Link, navigate, useRoute } from "./router.tsx";
import { cycleTheme, useTheme } from "./theme.ts";
import { Button, Spinner, Toasts } from "./ui.tsx";
import { NeedsToken, SignIn } from "./SignIn.tsx";
import { JobsPage } from "./jobs/JobsPage.tsx";
import { SetupPage } from "./setup/SetupPage.tsx";

type Session =
  | { state: "loading" }
  | { state: "offline"; message: string }
  | { state: "needs_token"; me: Me }
  | { state: "signed_out"; me: Me }
  | { state: "ready"; me: Me };

const toSession = (me: Me): Session => (me.needs_token ? { state: "needs_token", me } : me.authed ? { state: "ready", me } : { state: "signed_out", me });

export function App() {
  const [session, setSession] = useState<Session>({ state: "loading" });
  const check = useCallback(
    () =>
      api.me().then(
        (me) => setSession(toSession(me)),
        (e: Error) => setSession({ state: "offline", message: e.message }),
      ),
    [],
  );

  useEffect(() => {
    check();
    setUnauthorizedHandler(() => setSession((s) => ("me" in s ? { state: "signed_out", me: { ...s.me, authed: false } } : s)));
  }, [check]);

  const ready = session.state === "ready";
  useEffect(() => (ready ? startPulse() : undefined), [ready]);

  const route = useRoute();
  useEffect(() => {
    if (session.state === "ready" && route.page === "login") navigate("/", { replace: true });
  }, [session.state, route.page]);

  if (session.state === "loading") {
    return (
      <div className="boot">
        <Spinner />
      </div>
    );
  }
  if (session.state === "offline") {
    return (
      <div className="gate">
        <div className="gate-card">
          <Mark />
          <h1>Can't reach Hunt</h1>
          <p className="muted">{session.message}</p>
          <Button variant="primary" onClick={check}>
            Try again
          </Button>
        </div>
      </div>
    );
  }
  if (session.state === "needs_token") return <NeedsToken onCheck={check} />;
  if (session.state === "signed_out") return <SignIn onSignedIn={check} />;

  return (
    <div className="app">
      <Header me={session.me} onSignOut={() => api.logout().finally(check)} />
      <main className="app-main" id="main">{route.page === "setup" ? <SetupPage me={session.me} section={route.section} /> : route.page === "jobs" ? <JobsPage route={route} /> : null}</main>
      <Toasts />
    </div>
  );
}

export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" className="mark-bg" />
      <circle cx="16" cy="16" r="8" fill="none" className="mark-ring" strokeWidth="2.5" />
      <circle cx="16" cy="16" r="2.5" className="mark-dot" />
    </svg>
  );
}

const THEME_ICON = { system: Monitor, light: Sun, dark: Moon };

function Header({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const route = useRoute();
  const theme = useTheme();
  const ThemeIcon = THEME_ICON[theme];
  return (
    <header className="header">
      <Link to="/" className="brand" aria-label="Hunt home">
        <Mark />
        <span>Hunt</span>
      </Link>
      <nav className="nav" aria-label="Main">
        <Link to="/" className="nav-link" aria-current={route.page === "jobs" ? "page" : undefined}>
          Jobs
        </Link>
        <Link to="/setup" className="nav-link" aria-current={route.page === "setup" ? "page" : undefined}>
          Setup
        </Link>
      </nav>
      <div className="header-end">
        {me.dev && (
          <span className="local-badge" title="DEV_NO_AUTH is on: no sign-in, everything is open.">
            <span className="local-dot" />
            Local mode
          </span>
        )}
        <Button variant="ghost" size="sm" icon={<ThemeIcon size={16} strokeWidth={1.75} />} onClick={cycleTheme} aria-label={`Theme: ${theme}. Change theme`} title={`Theme: ${theme}`} />
        {!me.dev && <Button variant="ghost" size="sm" icon={<LogOut size={16} strokeWidth={1.75} />} onClick={onSignOut} aria-label="Sign out" title="Sign out" />}
      </div>
    </header>
  );
}
