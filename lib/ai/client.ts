import OpenAI from "openai";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

export const openai = new OpenAI({
  apiKey: requireEnv("OPENAI_API_KEY")
});
