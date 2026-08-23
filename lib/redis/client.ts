import { Redis } from "@upstash/redis";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

let instance: Redis | null = null;

/**
 * Lazy singleton — the Upstash client is built on first use instead of at
 * import time, so importing this module never requires env vars to be set
 * (keeps `next build` page-data collection working without credentials).
 */
export function getRedis(): Redis {
  if (!instance) {
    instance = new Redis({
      url: requireEnv("UPSTASH_REDIS_REST_URL"),
      token: requireEnv("UPSTASH_REDIS_REST_TOKEN")
    });
  }
  return instance;
}
