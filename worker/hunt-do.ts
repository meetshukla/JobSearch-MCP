/**
 * All of Hunt lives in one Durable Object: its SQLite database, the HTTP app (website API and MCP),
 * and an alarm that keeps collecting jobs.
 */
import { DurableObject } from "cloudflare:workers";
import type { Hono } from "hono";
import { useDurableObjectSql } from "./db-do.ts";
import { createApp } from "../server/app.ts";
import { tick, TICK_MS } from "../server/lib/collect.ts";

export interface Env {
  HUNT: DurableObjectNamespace<Hunt>;
  ASSETS: Fetcher;
  HUNT_TOKEN?: string;
  /** Local development only: skips sign-in. */
  DEV_NO_AUTH?: string;
}

export class Hunt extends DurableObject<Env> {
  private app: Hono;
  private ticking = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    for (const [k, v] of Object.entries(env)) if (typeof v === "string") process.env[k] = v;
    useDurableObjectSql(ctx.storage);
    this.app = createApp({
      wake: () => void this.ctx.storage.setAlarm(Date.now() + 1000),
      dev: () => env.DEV_NO_AUTH === "1",
    }) as unknown as Hono;
    ctx.blockConcurrencyWhile(async () => {
      if ((await ctx.storage.getAlarm()) == null) await ctx.storage.setAlarm(Date.now() + 3000);
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname === "/internal/wake") {
      if ((await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(Date.now() + 1000);
      return new Response("ok");
    }
    return this.app.fetch(request);
  }

  async alarm(): Promise<void> {
    // Schedule the next tick first, so one failure never stops the collector.
    await this.ctx.storage.setAlarm(Date.now() + TICK_MS);
    if (this.ticking) return;
    this.ticking = true;
    try {
      await tick();
    } catch (e: any) {
      console.error("tick failed", e?.stack || e);
    } finally {
      this.ticking = false;
    }
  }
}
