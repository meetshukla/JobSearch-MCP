import { forwardRef, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";
import { VIEWS, SETTINGS_SECTIONS, viewByPath, type SettingsSection, type ViewId } from "./model.ts";

/** "saved" uses the saved filter window; a number or null (any age) overrides it for the list. */
export type Posted = "saved" | 1 | 3 | null;
export type ListQuery = { q: string; remote: boolean; posted: Posted };

export type Route =
  | { page: "jobs"; view: ViewId; jobId: string | null; query: ListQuery }
  | { page: "settings"; section: SettingsSection | null }
  | { page: "login" };

const POSTED: Record<string, Posted> = { "1": 1, "3": 3, any: null };
const LEGACY_VIEW: Record<string, ViewId> = { to_review: "review", shortlist: "shortlist", applied: "applied", skipped: "skipped", rejected: "rejected", all: "all" };
const section = (s: string | undefined) => SETTINGS_SECTIONS.find((x) => x.id === s)?.id ?? null;

function parse(pathname: string, search: string): Route {
  const [head, ...tail] = pathname.split("/").filter(Boolean);
  const first = head && decodeURIComponent(head);
  // Workday job ids contain "/", and an encoded "%2F" can reach us decoded, so the rest of the path is the id.
  const second = tail.length ? decodeURIComponent(tail.join("/")) : undefined;
  if (first === "login") return { page: "login" };
  if (first === "settings" || first === "setup") return { page: "settings", section: first === "setup" ? (section(second) ?? "connect") : section(second) };
  const p = new URLSearchParams(search);
  const posted = p.get("posted");
  const query: ListQuery = { q: p.get("q") ?? "", remote: p.get("remote") === "1", posted: posted && posted in POSTED ? POSTED[posted] : "saved" };
  if (first === "jobs") return { page: "jobs", view: "all", jobId: second ?? null, query };
  const view = viewByPath(first) ?? LEGACY_VIEW[p.get("view") ?? ""] ?? "review";
  return { page: "jobs", view, jobId: viewByPath(first) ? (second ?? null) : null, query };
}

function querySearch(q: ListQuery) {
  const p = new URLSearchParams();
  if (q.q) p.set("q", q.q);
  if (q.remote) p.set("remote", "1");
  if (q.posted !== "saved") p.set("posted", q.posted === null ? "any" : String(q.posted));
  const s = p.toString();
  return s ? `?${s}` : "";
}

const EMPTY_QUERY: ListQuery = { q: "", remote: false, posted: "saved" };

export const jobsPath = (view: ViewId, jobId: string | null = null, query: ListQuery = EMPTY_QUERY) =>
  `/${VIEWS[view].path}${jobId ? `/${encodeURIComponent(jobId)}` : ""}${querySearch(query)}`;

export const settingsPath = (s: SettingsSection | null = null) => (s ? `/settings/${s}` : "/settings");

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

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; replace?: boolean };

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({ to, replace, onClick, ...rest }, ref) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to, { replace });
  };
  return <a ref={ref} href={to} onClick={handle} {...rest} />;
});
