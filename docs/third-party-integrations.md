# Third-party integrations

Hire talks to exactly five external services. This page maps them to code, lists what happens when they fail, and links to a detailed guide per provider.

## Integration map

| Service | Purpose | Env vars | Code entry points | Wrapped in retry? |
|---------|---------|----------|-------------------|-------------------|
| **Google OAuth + Gmail API** | Sign-in, reading the inbox, threaded replies, label dedupe | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `lib/gmail/client.ts` (factory) · `messages.ts` · `labels.ts` · `send.ts` · `lib/auth.ts` | ✅ list / get / labels / create / modify / send |
| **OpenAI** | Classify email + extract candidate + draft reply (`gpt-4o`, strict JSON schema) | `OPENAI_API_KEY` | `lib/ai/client.ts` · `analyze.ts` | ✅ completion call |
| **Resend** (optional) | Alternate transactional sender for users who prefer it over Gmail sending | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | `lib/resend/client.ts` · `send.ts` | ✅ send call |
| **Upstash Redis** | The only datastore: OAuth refresh tokens, active-user set, per-user settings | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | `lib/redis/client.ts` · `tokens.ts` · `settings.ts` | ❌ direct REST calls |
| **Vercel Cron** | Triggers `/api/cron/poll` every 5 minutes; auto-injects bearer secret | `CRON_SECRET` | `vercel.json` · `app/api/cron/poll/route.ts` | n/a (inbound) |

## How they connect

```
 Vercel Cron ──► /api/cron/poll ──► Upstash Redis (who is connected? tokens? settings?)
                                        │
                                        ▼
                                   Gmail API ──► OpenAI ──► Gmail API or Resend
                                   (read mail)    (think)     (send reply)
                                                                    │
                                        Gmail labels ◄──────────────┘
                                        (dedupe marker applied AFTER send)
```

## Failure-handling matrix

All outbound HTTP calls to Gmail/OpenAI/Resend pass through [`lib/retry.ts`](../lib/retry.ts):

- **Retries:** 3 retries after the initial attempt (4 total).
- **Backoff:** exponential — 1s → 2s → 4s.
- **Retryable conditions:** HTTP status `429` or `503`, or any error with no numeric `status`/`code` (treated as a network failure).
- **Not retried:** all other statuses (4xx auth/validation errors fail fast and surface in the cron JSON as `status: "error"`).

| Provider | Typical failure | System behavior |
|----------|-----------------|-----------------|
| Gmail | `invalid_grant` (expired refresh token) | User's loop errors once, logged with userId; other users unaffected. Re-login fixes. |
| Gmail | 403 on `messages.modify` | Usually stale consent — sign out/in to re-grant scopes |
| Gmail | 429 quota | Backed off up to 3×, then message marked error and retried next cron run |
| OpenAI | Empty/malformed JSON | Throws → caught per-message → retried next run |
| Resend | Missing from-address | Fails *before* send (`settings.resendFromEmail ?? RESEND_FROM_EMAIL ?? throw`) → no label → retry next run |
| Redis | Network/REST outage | Cron returns 500 for user listing; per-user reads are isolated by try/catch |
| Vercel Cron | Function timeout (60s cap) | Partial batch completes; unlabeled messages resume next run |

**Isolation rule:** every user iteration and every message iteration has its own try/catch inside the cron route. A single failure produces one log line + one result row — never a crashed batch.

## Deep dives

1. [Google OAuth & Gmail API](integrations/google-oauth-gmail.md)
2. [OpenAI](integrations/openai.md)
3. [Resend](integrations/resend.md)
4. [Upstash Redis](integrations/upstash-redis.md)
5. [Vercel Cron](integrations/vercel-cron.md)
