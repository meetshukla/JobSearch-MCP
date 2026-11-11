/** Optional starter lists of company boards. Nothing is imported unless you or your agent asks. */
import northAmericaTech from "../../lists/north-america-tech.json";
import type { StarterList } from "../../shared/types.ts";

export type ListCompany = { name: string; ats: string; slug: string; url?: string; tags?: string[] };

export const LISTS: Record<string, { label: string; description: string; companies: ListCompany[] }> = {
  "north-america-tech": {
    label: "North America tech",
    description: "1,000 tech companies with public job boards, mostly US and Canada: startups, scale-ups and big tech.",
    companies: northAmericaTech as ListCompany[],
  },
};

export const starterLists = (): StarterList[] =>
  Object.entries(LISTS).map(([id, l]) => ({ id, label: l.label, description: l.description, companies: l.companies.length }));
