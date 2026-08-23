# Vercel Cron integration

A single scheduled trigger drives the whole product: every five minutes Vercel calls `GET /api/cron/poll`, which processes every connected user's pending applications end-to-end.

- [1. Configuration](#1-configuration)
- [2. Authentication contract](#2-authentication-contract)
- [3. Execution budget](#3-execution-budget)
- [4. Response shape](#4-response-shape)
- [5. Observability & operations](#5-observability--operations)
- [6. Concurrency & edge cases](#6-concurrency--edge-cases)

---

## 1. Configuration

[`vercel.json`](../vercel.json):

```json
{
  "crons": [
    { "path": "/api/cron/poll", "schedule": "*/5 * * * *" }
  ]
}
```

- Schedule syntax is standard crontab, evaluated in **UTC**.
- The route exports `dynamic = "force-dynamic"` so it is never cached or prerendered.
- **Plan caveat:** Hobby projects can run crons at most once per day. `*/5` requires Vercel Pro — or drive the same endpoint externally (GitHub Actions cron, cron-job.org, etc.) with the bearer header below.

## 2. Authentication contract

The route handler ([`app/api/cron/poll/route.ts`](../../app/api/cron/poll/route.ts)) checks, before anything else:

```ts
const authHeader = request.headers.get("authorization") ?? "";
if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

Vercel automatically sends `Authorization: Bearer ${CRON_SECRET}` to cron endpoints **when an env var named exactly `CRON_SECRET` exists** on the project. Manual invocation works identically:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" https://your-app.vercel.app/api/cron/poll
```

Any mismatch (or unset secret) yields `401 {"error":"Unauthorized"}` — the endpoint is public on the internet, so this gate is non-negotiable.

## 3. Execution budget

| Constraint | Value | Mitigation |
|-----------|-------|------------|
| Function timeout | 60s (`export const maxDuration = 60`) | ≤20 messages fetched per user (`maxResults: 20`); large backlogs drain across runs |
| Processing order | Users sequential → messages sequential | Predictable quota usage; failures isolated per unit |
| AI latency | Dominant cost (~1–3s/message) | Strict JSON single-call design |

If a run times out mid-batch, completed messages are already labeled; unlabeled ones simply resume next tick — the label-as-dedupe design makes interruption harmless.

## 4. Response shape

Success:

```json
{
  "success": true,
  "processedCount": 3,
  "results": [
    { "userId": "108…", "messageId": "18c9f…", "status": "sent",
      "detail": "replied to priya@example.com" },
    { "userId": "108…", "messageId": "18ca1…", "status": "skipped",
      "detail": "not a job application, labeled as processed" },
    { "userId": "108…", "messageId": "18ca7…", "status": "skipped",
      "detail": "candidate email not found, left unlabeled for manual review" },
    { "userId": "109…", "messageId": "18cb0…", "status": "error",
      "detail": "Resend send failed (validation_error): …" }
  ]
}
```

Failures:

| Condition | Status |
|-----------|--------|
| Bad/missing bearer secret | `401` |
| Redis unavailable while listing users | `500 {"success":false,"error":"failed to list active users"}` |
| Per-user / per-message problems | `200` with error rows (isolation rule) |

## 5. Observability & operations

Server logs (Vercel → Deployments → Functions, or `vercel logs`) use greppable prefixes:

| Prefix | Meaning |
|--------|---------|
| `[cron/poll] failed processing message {id} for user {userId}:` | One message failed; batch continued |
| `[cron/poll] failed processing user {userId}:` | Whole user skipped; others unaffected |
| `[cron/poll] …no extractable candidate email…` | Needs human review (also visible as `skipped` row) |
| `[withRetry] {label} failed on attempt n/4 (status 429)…` | Transient upstream failure being backed off |

Health check routine: hit the endpoint manually after deploying; expect `"success": true` and zero `error` rows under normal operation.

## 6. Concurrency & edge cases

- **Overlapping runs:** Vercel won't start a new cron execution for the same project while one is running (per-job serialization); even if two runs ever overlapped, the post-send labeling window keeps duplicates unlikely rather than impossible.
- **User with revoked token:** their loop throws once, logged with userId; everyone else proceeds.
- **Empty inbox:** returns immediately with empty `results`.
- **Clock/schedule drift:** schedules are best-effort UTC ticks; don't build logic assuming exact 300s spacing.
