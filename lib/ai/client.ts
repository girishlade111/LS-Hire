import OpenAI from "openai";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

let instance: OpenAI | null = null;

/** Lazy singleton — env validated on first use, not at import (build-safe). */
export function getOpenAI(): OpenAI {
  if (!instance) {
    instance = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  }
  return instance;
}
