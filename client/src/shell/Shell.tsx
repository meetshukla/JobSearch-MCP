import { useEffect, useMemo, useState } from "react";
import type { Me } from "../../../shared/types.ts";
import { tool } from "../api.ts";
import { useLoad } from "../live.ts";
import { todayIso } from "../format.ts";
import { useRoute, navigate, settingsPath } from "../router.tsx";
import { AppDataContext, type AppData, type PaletteMode } from "../data.tsx";
import { PHONE, shortcutBlocked, useMedia } from "../ui.tsx";
import { JobsView } from "../jobs/JobsView.tsx";
import { SettingsView } from "../settings/SettingsView.tsx";
import { Sidebar } from "./Sidebar.tsx";
import { TabBar } from "./PhoneNav.tsx";
import { CommandMenu } from "./CommandMenu.tsx";
import { ShortcutsDialog } from "./Shortcuts.tsx";

export function Shell({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const route = useRoute();
  const phone = useMedia(PHONE);
  const today = useLoad(() => tool("today", { date: todayIso() }), "today", ["jobs", "sources", "settings"]);
  const settings = useLoad(() => tool("get_settings", {}), "settings", ["settings"]);
  const [palette, setPalette] = useState<PaletteMode | null>(null);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    if (route.page === "settings" && route.section === null && !phone) navigate(settingsPath("connect"), { replace: true });
  }, [route, phone]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => (p ? null : "all"));
        return;
      }
      if (shortcutBlocked(e)) return;
      if (e.key === "?") {
        e.preventDefault();
        setHelp(true);
      } else if (e.key === "t") {
        e.preventDefault();
        setPalette("track");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const data: AppData = useMemo(
    () => ({
      me,
      counts: today.data?.counts,
      today: today.data,
      settings: settings.data,
      openPalette: setPalette,
      openShortcuts: () => setHelp(true),
      signOut: onSignOut,
    }),
    [me, today.data, settings.data, onSignOut],
  );

  const detailOpen = route.page === "jobs" && route.jobId !== null;
  return (
    <AppDataContext.Provider value={data}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className="app" data-detail={detailOpen || undefined}>
        {!phone && <Sidebar route={route} />}
        <main className="main" id="main" tabIndex={-1}>
          {route.page === "settings" ? <SettingsView section={route.section} phone={phone} /> : route.page === "jobs" ? <JobsView route={route} phone={phone} /> : null}
        </main>
        {phone && !detailOpen && <TabBar route={route} />}
      </div>
      <CommandMenu mode={palette} onMode={setPalette} />
      <ShortcutsDialog open={help} onOpenChange={setHelp} />
    </AppDataContext.Provider>
  );
}
