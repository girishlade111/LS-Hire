import { describe, expect, it, vi } from "vitest";
import {
  acquireMessageLock,
  markReplied,
  releaseMessageLock,
  wasAlreadyReplied
} from "@/lib/redis/run-guard";

vi.mock("@/lib/redis/client", () => {
  type SetArgs = { nx?: boolean; ex?: number };
  const kv = new Map<string, unknown>();
  return {
    getRedis: () => ({
      set: vi.fn(async (key: string, value: unknown, args?: SetArgs) => {
        if (args?.nx && kv.has(key)) {
          return null;
        }
        kv.set(key, value);
        return "OK";
      }),
      get: vi.fn(async (key: string) => kv.get(key) ?? null),
      del: vi.fn(async (key: string) => {
        kv.delete(key);
        return 1;
      })
    })
  };
});

describe("run-guard", () => {
  it("acquires a lock once and rejects the second acquisition", async () => {
    expect(await acquireMessageLock("msg-1")).toBe(true);
    expect(await acquireMessageLock("msg-1")).toBe(false);
    await releaseMessageLock("msg-1");
    expect(await acquireMessageLock("msg-1")).toBe(true);
    await releaseMessageLock("msg-1");
  });

  it("tracks replied state via the idempotency marker", async () => {
    expect(await wasAlreadyReplied("user-1", "msg-2")).toBe(false);
    await markReplied("user-1", "msg-2");
    expect(await wasAlreadyReplied("user-1", "msg-2")).toBe(true);
    expect(await wasAlreadyReplied("user-other", "msg-2")).toBe(false);
  });
});
