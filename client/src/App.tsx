import { useCallback, useEffect, useState } from "react";
import type { Me } from "../../shared/types.ts";
import { api, setUnauthorizedHandler } from "./api.ts";
import { startPulse } from "./live.ts";
import { navigate, useRoute } from "./router.tsx";
import { Spinner, TipProvider } from "./ui.tsx";
import { ToastProvider } from "./toast.tsx";
import { NeedsToken, Offline, SignIn } from "./SignIn.tsx";
import { Shell } from "./shell/Shell.tsx";

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
  const signOut = useCallback(() => void api.logout().finally(check), [check]);

  useEffect(() => {
    check();
    setUnauthorizedHandler(() => setSession((s) => ("me" in s ? { state: "signed_out", me: { ...s.me, authed: false } } : s)));
  }, [check]);

  const ready = session.state === "ready";
  useEffect(() => (ready ? startPulse() : undefined), [ready]);

  const route = useRoute();
  useEffect(() => {
    if (ready && route.page === "login") navigate("/", { replace: true });
  }, [ready, route.page]);

  return (
    <TipProvider delay={500}>
      <ToastProvider>
        {session.state === "loading" ? (
          <div className="boot">
            <Spinner />
          </div>
        ) : session.state === "offline" ? (
          <Offline message={session.message} onRetry={check} />
        ) : session.state === "needs_token" ? (
          <NeedsToken onCheck={check} />
        ) : session.state === "signed_out" ? (
          <SignIn onSignedIn={check} />
        ) : (
          <Shell me={session.me} onSignOut={signOut} />
        )}
      </ToastProvider>
    </TipProvider>
  );
}
