# Resend integration

Resend is the **optional** sending path. Each user picks their reply method in `/dashboard/reply-method`; Gmail threading remains the default.

- [1. When Resend is used](#1-when-resend-is-used)
- [2. From-address resolution](#2-from-address-resolution)
- [3. Domain setup](#3-domain-setup)
- [4. Code internals](#4-code-internals)
- [5. Failure modes](#5-failure-modes)

---

## 1. When Resend is used

The cron route checks `settings.replyMethod` per user ([`app/api/cron/poll/route.ts`](../../app/api/cron/poll/route.ts)):

```ts
if (settings.replyMethod === "resend") { … } else { /* Gmail threaded reply */ }
```

Choose this when you want replies to originate from a branded domain (`careers@yourcompany.com`) instead of the connected personal Gmail account. Note the trade-off: Resend messages are standalone emails (no Gmail thread), while the Gmail path threads inside the candidate's inbox conversation.

## 2. From-address resolution

Resolved fresh on every send, in priority order:

1. `settings.resendFromEmail` — the user's per-user value saved from the Reply-method page
2. `process.env.RESEND_FROM_EMAIL` — deployment-wide fallback
3. Neither present → **throw** before any send attempt

Because the throw happens *before* sending and *before* the processed label is applied, a misconfigured sender simply retries every 5 minutes without ever double-sending or silently dropping mail — it surfaces as `status: "error"` rows in the poll JSON until fixed.

## 3. Domain setup

1. Sign up at [resend.com](https://resend.com), create an API key → `RESEND_API_KEY`.
2. Domains → *Add domain* → add the DNS records Resend shows (SPF/DKIM at minimum) at your registrar.
3. Wait for verification, then use addresses on that domain as the From value, e.g. `Hire <hire@yourdomain.com>`.

> The sandbox sender `onboarding@resend.dev` can only deliver to **your own** account's email — fine for a first smoke test, useless for real candidates.

## 4. Code internals

- Client singleton: [`lib/resend/client.ts`](../../lib/resend/client.ts) — `new Resend(requireEnv("RESEND_API_KEY"))`, eager at import.
- Sender: [`lib/resend/send.ts`](../../lib/resend/send.ts):

```ts
sendResendReply({ to, subject, body, fromEmail })
// → resend.emails.send({ from, to, subject, text })
```

Plain-text only (`text` field) to mirror the Gmail path's simplicity. The SDK v4 does not throw on API errors — it resolves `{ data, error }`, so the wrapper inspects `response.error` and converts it into a thrown `Error` (`Resend send failed (<name>): <message>`) so cron logging and retry semantics stay uniform across both providers.

## 5. Failure modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Error row *"reply method is resend but no sender email is configured"* | Resolution chain empty | Set from-address on the Reply-method page or `RESEND_FROM_EMAIL` env var |
| `403` / validation_error from Resend | From domain not verified | Complete DNS verification |
| Mail not delivered to test address | Using sandbox sender | Use a verified-domain address |
| Repeated identical errors every 5 min | Persistent config issue | Expected safe-retry behavior — no label applied, nothing lost; fix config and next run succeeds |
