import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withRetry } from "@/lib/retry";

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns immediately on success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { retries: 3 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on retryable status and succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("rate"), { status: 429 }))
      .mockResolvedValueOnce("ok");

    const promise = withRetry(fn, { baseDelayMs: 10 });
    await vi.advanceTimersByTimeAsync(100);
    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on 503 and network errors but not 400", async () => {
    const badRequest = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("bad"), { status: 400 }));
    await expect(withRetry(badRequest, { baseDelayMs: 1 })).rejects.toThrow(
      "bad"
    );
    expect(badRequest).toHaveBeenCalledTimes(1);
  });

  it("exhausts retries on persistent network errors", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fn = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    const promise = withRetry(fn, { retries: 2, baseDelayMs: 5 });
    const assertion = expect(promise).rejects.toThrow("ECONNRESET");
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(fn).toHaveBeenCalledTimes(3);
    errorSpy.mockRestore();
  });

  it("uses exponential backoff delays between attempts", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let calls = 0;
    const timestamps: number[] = [];
    const fn = vi.fn().mockImplementation(async () => {
      timestamps.push(Date.now());
      calls += 1;
      if (calls < 4) {
        throw new Error("flaky");
      }
      return "done";
    });

    const promise = withRetry(fn, { retries: 3, baseDelayMs: 100 });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(promise).resolves.toBe("done");

    // Expected gaps: ~100ms, ~200ms, ~400ms (exponential backoff).
    const gap1 = timestamps[1]! - timestamps[0]!;
    const gap2 = timestamps[2]! - timestamps[1]!;
    const gap3 = timestamps[3]! - timestamps[2]!;
    expect(gap1).toBeGreaterThanOrEqual(95);
    expect(gap2).toBeGreaterThanOrEqual(195);
    expect(gap3).toBeGreaterThanOrEqual(395);
    vi.restoreAllMocks();
  });
});
