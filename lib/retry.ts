type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  label?: string;
};

function extractStatus(error: unknown): number | undefined {
  if (error !== null && typeof error === "object") {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") {
      return status;
    }
    const code = (error as { code?: unknown }).code;
    if (typeof code === "number") {
      return code;
    }
  }
  return undefined;
}

function isRetryable(status: number | undefined): boolean {
  return status === undefined || status === 429 || status === 503;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: RetryOptions
): Promise<T> {
  const retries = opts?.retries ?? 3;
  const baseDelayMs = opts?.baseDelayMs ?? 1000;
  const label = opts?.label ?? "external API call";

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = extractStatus(error);
      const retryable = isRetryable(status);
      if (!retryable || attempt === retries) {
        break;
      }
      const delayMs = baseDelayMs * Math.pow(2, attempt);
      console.error(
        `[withRetry] ${label} failed on attempt ${attempt + 1}/${
          retries + 1
        }${
          status === undefined ? " (network error)" : ` (status ${status})`
        }, retrying in ${delayMs}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
