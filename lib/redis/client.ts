import { Redis } from "@upstash/redis";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

export const redis = new Redis({
  url: requireEnv("UPSTASH_REDIS_REST_URL"),
  token: requireEnv("UPSTASH_REDIS_REST_TOKEN")
});
