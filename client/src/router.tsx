import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";
import type { View } from "../../shared/types.ts";
import { VIEWS } from "../../shared/types.ts";

export const SETUP_SECTIONS = ["connect", "profile", "filters", "sources"] as const;
export type SetupSection = (typeof SETUP_SECTIONS)[number];

/** "saved" uses the saved filter window; a number or null (any age) overrides it for the list. */
export type Posted = "saved" | 1 | 3 | null;

export type ListState = { view: View; q: string; remote: boolean; posted: Posted };

export type Route =
  | { page: "jobs"; jobId: string | null; list: ListState }
  | { page: "setup"; section: SetupSection }
  | { page: "login" };

const POSTED: Record<string, Posted> = { "1": 1, "3": 3, any: null };

function parse(pathname: string, search: string): Route {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "login") return { page: "login" };
  if (parts[0] === "setup") {
    const section = SETUP_SECTIONS.find((s) => s === parts[1]) ?? "connect";
    return { page: "setup", section };
  }
  const p = new URLSearchParams(search);
  const view = VIEWS.find((v) => v === p.get("view")) ?? "to_review";
  const posted = p.get("posted");
  return {
    page: "jobs",
    jobId: parts[0] === "jobs" && parts[1] ? decodeURIComponent(parts[1]) : null,
    list: { view, q: p.get("q") ?? "", remote: p.get("remote") === "1", posted: posted && posted in POSTED ? POSTED[posted] : "saved" },
  };
}

export function listSearch(l: ListState) {
  const p = new URLSearchParams();
  if (l.view !== "to_review") p.set("view", l.view);
  if (l.q) p.set("q", l.q);
  if (l.remote) p.set("remote", "1");
  if (l.posted !== "saved") p.set("posted", l.posted === null ? "any" : String(l.posted));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const jobPath = (id: string | null, l: ListState) => `${id ? `/jobs/${encodeURIComponent(id)}` : "/"}${listSearch(l)}`;

const listeners = new Set<() => void>();
let current = parse(location.pathname, location.search);
let currentHref = location.pathname + location.search;

function sync() {
  const href = location.pathname + location.search;
  if (href === currentHref) return;
  currentHref = href;
  current = parse(location.pathname, location.search);
  for (const l of listeners) l();
}
window.addEventListener("popstate", sync);

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (to === location.pathname + location.search) return;
  history[opts.replace ? "replaceState" : "pushState"](null, "", to);
  sync();
}

export function useRoute() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export function Link({ to, replace, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; replace?: boolean }) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to, { replace });
  };
  return <a href={to} onClick={handle} {...rest} />;
}
