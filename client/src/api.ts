import type {
  AddSourceResult,
  Filters,
  JobDetail,
  ListJobsResult,
  ListSourcesResult,
  Me,
  Settings,
  SourceKind,
  SourceState,
  Status,
  Today,
  View,
} from "../../shared/types.ts";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export type ContactInput = {
  name: string;
  title?: string | null;
  linkedin_url?: string | null;
  email?: string | null;
  email_verified?: boolean | null;
  note?: string | null;
  contacted_at?: string | null;
};

export type ListJobsArgs = {
  view?: View;
  query?: string;
  remote_only?: boolean;
  posted_within_days?: number | null;
  limit?: number;
  offset?: number;
};

export type SettingsResult = Settings & { default_filters: Filters; lists: { id: string; label: string; companies: number }[] };
export type FiltersPreview = { jobs_now: number; jobs_with_these_filters: number; note: string };
export type SourceAction = "pause" | "resume" | "remove" | "read_now";
export type ToolInfo = { name: string; title: string; description: string };

/** Every tool the website calls, with its arguments and result. One table, so a call can't drift from the server. */
type Tools = {
  get_settings: [Record<string, never>, SettingsResult];
  update_settings: [{ profile?: string; filters?: Partial<Filters> }, { saved: true; filters: Filters; profile_chars: number; rereading_sources: boolean }];
  add_sources: [{ items?: string[]; list?: string }, { results: AddSourceResult[] }];
  list_sources: [{ state?: SourceState; kind?: SourceKind; query?: string; limit?: number; offset?: number }, ListSourcesResult];
  update_sources: [{ ids: number[]; action: SourceAction }, { changed: number }];
  list_jobs: [ListJobsArgs, ListJobsResult];
  get_job: [{ job_id: string; html?: boolean }, JobDetail];
  add_job: [{ url: string; note?: string }, JobDetail];
  update_job: [
    {
      job_id: string;
      status?: Status;
      verdict?: { score: number; note: string } | null;
      note?: string;
      contacts?: ContactInput[];
      follow_up_at?: string | null;
    },
    JobDetail,
  ];
};

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

async function request<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && path !== "/api/login") onUnauthorized();
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

export const tool = <N extends keyof Tools>(name: N, args: Tools[N][0]) => request<Tools[N][1]>(`/api/tools/${name}`, args);

export const api = {
  me: () => request<Me>("/api/me"),
  login: (token: string) => request<{ ok: true }>("/api/login", { token }),
  logout: () => request<{ ok: true }>("/api/logout", {}),
  tools: () => request<{ tools: ToolInfo[] }>("/api/tools"),
  summary: (date: string) => request<Today>(`/api/summary?date=${date}`),
  previewFilters: (filters: Filters) => request<FiltersPreview>("/api/tools/update_settings", { filters, preview: true }),
  pulse: (since: number, instance: string) =>
    request<{ instance: string; version: number; reset: boolean; changes: Topic[] }>(`/api/pulse?since=${since}&instance=${encodeURIComponent(instance)}`),
};

export type Topic = "jobs" | "job" | "sources" | "settings";
