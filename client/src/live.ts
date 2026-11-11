import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api, type Topic } from "./api.ts";

/**
 * Live data. The server bumps a topic whenever something changes (your agent writing a verdict, a source being read).
 * We poll /api/pulse and keep one counter per topic; anything loaded with useLoad reloads when its topics move.
 */
const TOPICS: Topic[] = ["jobs", "job", "sources", "settings"];
let counters: Record<Topic, number> = { jobs: 0, job: 0, sources: 0, settings: 0 };
const listeners = new Set<() => void>();

export function bump(topics: Topic[] = TOPICS) {
  counters = { ...counters };
  for (const t of topics) counters[t]++;
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function useTopicsVersion(topics: Topic[]) {
  const snap = useSyncExternalStore(subscribe, () => counters);
  return topics.reduce((n, t) => n + snap[t], 0);
}

export function startPulse() {
  let since = 0;
  let instance = "";
  let timer = 0;
  let stopped = false;
  const tick = async () => {
    try {
      const p = await api.pulse(since, instance);
      if (instance && (p.reset || p.instance !== instance)) bump();
      else if (p.changes.length) bump([...new Set(p.changes)]);
      instance = p.instance;
      since = p.version;
    } catch {
      // Offline or signed out: try again on the next tick.
    }
    if (!stopped) timer = window.setTimeout(tick, document.hidden ? 20_000 : 3_000);
  };
  const onVisible = () => {
    if (document.hidden) return;
    window.clearTimeout(timer);
    tick();
  };
  document.addEventListener("visibilitychange", onVisible);
  tick();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

export type Loaded<T> = {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => void;
  set: (fn: (cur: T) => T) => void;
};

/** Loads on mount, when `key` changes, and when one of `topics` changes. Keeps the last data while reloading. */
export function useLoad<T>(load: () => Promise<T>, key: string, topics: Topic[]): Loaded<T> {
  const version = useTopicsVersion(topics);
  const [state, setState] = useState<{ data?: T; error: string | null; loading: boolean; key: string }>({ error: null, loading: true, key });
  const seq = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const [manual, setManual] = useState(0);

  useEffect(() => {
    const n = ++seq.current;
    setState((s) => ({ ...s, loading: true, ...(s.key !== key ? { data: undefined, error: null, key } : {}) }));
    loadRef.current().then(
      (data) => n === seq.current && setState({ data, error: null, loading: false, key }),
      (e: Error) => n === seq.current && setState((s) => ({ ...s, error: e.message, loading: false })),
    );
  }, [key, version, manual]);

  const set = useCallback((fn: (cur: T) => T) => setState((s) => (s.data === undefined ? s : { ...s, data: fn(s.data) })), []);
  const reload = useCallback(() => setManual((m) => m + 1), []);
  const sameKey = state.key === key;
  return { data: sameKey ? state.data : undefined, error: sameKey ? state.error : null, loading: state.loading || !sameKey, reload, set };
}
