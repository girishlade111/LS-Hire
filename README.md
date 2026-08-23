# Hire — by Lade Stack

**AI-powered auto-replies for job-application emails, straight from Gmail.**

Hire watches a Gmail label in each connected user's inbox, uses OpenAI (`gpt-4o`) to recognize real job applications, extracts the *real* candidate's email address from the message body (not the `From` header), and sends a professional HR reply — either as a threaded Gmail reply or through Resend. It is a multi-user, production-grade replacement for a fragile n8n workflow.

| | |
|---|---|
| **Framework** | Next.js 14.2.15 (App Router) · React 18.3.1 · TypeScript 5.5 (strict) |
| **Auth** | NextAuth v4 · Google OAuth (offline access) · JWT sessions |
| **Email source** | Gmail API (`googleapis` v140) |
| **AI** | OpenAI `gpt-4o` with strict JSON-schema structured outputs |
| **Alt. sender** | Resend (optional, per-user choice) |
| **Datastore** | Upstash Redis (REST) — **only** for OAuth tokens + user settings |
| **Scheduler** | Vercel Cron — every 5 minutes |
| **Styling** | Tailwind CSS 3.4 with a locked dark token system |

---

## Table of contents

1. [Why this exists](#why-this-exists)
2. [How it works](#how-it-works)
3. [Architecture](#architecture)
4. [Project structure](#project-structure)
5. [Quick start (local development)](#quick-start-local-development)
6. [Provider setup](#provider-setup)
7. [Deploying to Vercel](#deploying-to-vercel)
8. [API reference](#api-reference)
9. [Design system](#design-system)
10. [Security model](#security-model)
11. [Troubleshooting](#troubleshooting)
12. [Known limitations](#known-limitations)
13. [Documentation index](#documentation-index)

---

## Why this exists

The original n8n workflow had two critical bugs that this app fixes by design:

| # | n8n bug | How Hire fixes it |
|---|---------|-------------------|
| 1 | The reply target was built from the **`From` header**. Forwarded application emails put the *forwarder's* address there, so replies went to the wrong person. | The full body is sent to GPT-4o, which extracts the real applicant address from the body/signature and explicitly ignores the outer `From`. |
| 2 | The email **body was never sent to the AI** at all, so "analysis" was guesswork on metadata. | Subject + full plain-text body are always analyzed together; HTML-only mail is stripped to text first. |

Additional workflow-level guarantees that n8n could not provide:

- **Multi-user** — every user signs in with their own Google account and connects their own Gmail. No shared inbox, no shared credentials.
- **Label-based dedupe** — an email is only marked processed (labeled `auto-replied`) *after* its reply actually sent. Failed sends stay unlabeled and are retried automatically on the next run. There is no separate tracking database to drift out of sync.
- **Failure isolation** — one bad email or one broken user can never abort the whole batch; every unit of work has its own try/catch.
- **No silent drops** — if an application has no extractable candidate address, it is logged loudly and left unlabeled for manual review instead of being skipped forever.
- **Prompt-injection defense** — stranger-authored email content is wrapped in `<untrusted_email>` tags and the system prompt forbids following instructions found inside them.

---

## How it works

```
┌──────────────┐   every 5 min    ┌─────────────────────────────────────────────┐
│ Vercel Cron  │ ───────────────► │ GET /api/cron/poll                          │
│ */5 * * * *  │  Bearer secret   │ (auth: CRON_SECRET)                         │
└──────────────┘                  └───────────────┬─────────────────────────────┘
                                                  │
                     ┌────────────────────────────▼───────────────────────────┐
                     │ Upstash Redis                                          │
                     │  users:active        → ids of connected users          │
                     │  user:{id}           → { email, refreshToken }         │
                     │  settings:{id}       → per-user labels/persona/method  │
                     └────────────────────────────┬───────────────────────────┘
                                                  │ per user (isolated try/catch)
                     ┌────────────────────────────▼───────────────────────────┐
                     │ Gmail API                                              │
                     │  search: label:{jobLabel} -label:{processedLabel}      │
                     │  fetch full MIME → recursive text/plain walk           │
                     │  (fallback: strip text/html)                           │
                     └────────────────────────────┬───────────────────────────┘
                                                  │ per message (isolated try/catch)
                     ┌────────────────────────────▼───────────────────────────┐
                     │ OpenAI gpt-4o (strict JSON schema)                     │
                     │  isJobApplication?                                     │
                     │  candidateName / candidateEmail / positionApplied      │
                     │  replySubject / replyBody                              │
                     └────────────────────────────┬───────────────────────────┘
                                                  │
                              ┌───────────────────┴───────────────────┐
                              ▼                                       ▼
                   not an application                      application + candidate email
                   → apply processed label                 → send reply via Gmail thread
                     (so it is never re-analyzed)            or Resend, THEN apply label
                                                          → no email found? leave unlabeled,
                                                            log for manual review
```

### Per-message decision matrix

| Situation | Reply sent? | Processed label applied? | Result row in response |
|-----------|-------------|--------------------------|------------------------|
| Not a job application | No | **Yes** | `status: "skipped"` — *"not a job application"* |
| Application, candidate email found | **Yes** (Gmail or Resend) | **Yes**, only after send succeeds | `status: "sent"` |
| Application, but no candidate email in body | No | **No** (stays pending) | `status: "skipped"` — *"left unlabeled for manual review"* |
| Any error anywhere in processing | Never | Never | `status: "error"` — retried next run automatically |

---

## Architecture

### Components

| Layer | File(s) | Responsibility |
|-------|---------|----------------|
| Auth | `lib/auth.ts`, `app/api/auth/[...nextauth]/route.ts`, `types/next-auth.d.ts` | Google OAuth with offline access; persists refresh tokens on sign-in; JWT session carries `user.id` |
| Identity store | `lib/redis/client.ts`, `lib/redis/tokens.ts` | Upstash Redis maps `userId → {email, refreshToken}` and tracks active users in a set |
| User settings | `lib/redis/settings.ts` | Per-user labels, AI persona, reply method — merged over sane defaults |
| Gmail layer | `lib/gmail/client.ts`, `types.ts`, `messages.ts`, `labels.ts`, `send.ts` | OAuth client factory, unprocessed-message search + MIME parsing, label dedupe, threaded RFC-2822 replies |
| AI layer | `lib/ai/client.ts`, `types.ts`, `analyze.ts` | gpt-4o structured-output analysis with anti-injection prompt framing |
| Alt. sender | `lib/resend/client.ts`, `lib/resend/send.ts` | Transactional send path for users who choose Resend |
| Resilience | `lib/retry.ts` | Shared `withRetry()` — exponential backoff on 429/503/network errors for every external call |
| Workflow | `app/api/cron/poll/route.ts` | The core loop: auth → users → messages → analyze → send → label |
| Settings API | `app/api/settings/route.ts` | Session-guarded GET/PATCH with Zod validation |
| UI | `app/page.tsx`, `app/dashboard/**`, `components/**` | Login screen, live dashboard, settings forms — all server-rendered where possible |

### Where data lives (and doesn't)

| Data | Store | Key |
|------|-------|-----|
| Google refresh token + email | Redis hash | `user:{userId}` |
| Active user id set | Redis set | `users:active` |
| Per-user settings | Redis hash | `settings:{userId}` |
| Which emails were processed | **Gmail labels only** | `{jobLabelName}` / `{processedLabelName}` |
| Applications list | **Gmail itself** (queried live) | — |

There is intentionally **no SQL database and no application-state table**. Gmail is the source of truth; Redis exists solely because OAuth refresh tokens must be readable by a headless serverless cron function.

---

## Project structure

```
LS-Hire/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts   # NextAuth GET/POST handler
│   │   ├── cron/poll/route.ts            # ★ core workflow (Vercel Cron target)
│   │   └── settings/route.ts             # GET / POST / PATCH user settings
│   ├── dashboard/
│   │   ├── page.tsx                      # Applications (pending + replied, live from Gmail)
│   │   ├── settings/page.tsx             # Label names + AI persona editor
│   │   └── reply-method/page.tsx         # Gmail vs Resend chooser
│   ├── globals.css                       # Dark theme + box-shadow ban + focus rules
│   ├── layout.tsx                        # Root shell
│   └── page.tsx                          # Public login screen
├── components/
│   ├── Button.tsx  Card.tsx  Primitives.tsx
│   ├── SettingsRow.tsx  Sidebar.tsx  Toggle.tsx
│   └── SignInButton.tsx
├── lib/
│   ├── ai/       client.ts · types.ts · analyze.ts
│   ├── gmail/    client.ts · types.ts · messages.ts · labels.ts · send.ts
│   ├── redis/    client.ts · tokens.ts · settings.ts
│   ├── resend/   client.ts · send.ts
│   ├── auth.ts
│   └── retry.ts
├── types/next-auth.d.ts                  # session.user.id augmentation
├── docs/                                 # ← you are reading its index below
├── .env.example
├── next.config.mjs · postcss.config.mjs · tailwind.config.ts · tsconfig.json
└── vercel.json                           # cron schedule
```

---

## Quick start (local development)

```bash
git clone <this repo>
cd LS-Hire
npm install
cp .env.example .env.local     # then fill in every value — see docs/configuration.md
npm run dev                    # http://localhost:3000
```

Minimum env vars to boot: `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OPENAI_API_KEY`, both `UPSTASH_REDIS_*` values, `CRON_SECRET`, `COMPANY_NAME`. `RESEND_*` is only needed if you switch reply method to Resend.

> The three external clients (`lib/redis/client.ts`, `lib/ai/client.ts`, `lib/resend/client.ts`) are lazy singletons that throw `Missing env var: X` on first use when their variable is absent — misconfiguration fails loudly rather than silently returning `undefined`.

Then:

1. Open `http://localhost:3000` and sign in with Google (consent screen will request Gmail modify access).
2. In Gmail, create a label called `job-applications` and apply it to a test application email (or use Gmail filters to auto-label incoming mail).
3. Trigger a poll manually:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/poll
```

4. Watch the JSON summary, then check `/dashboard` and the candidate's inbox.

---

## Provider setup

Step-by-step guides for every third party live in [`docs/third-party-integrations.md`](docs/third-party-integrations.md):

| Guide | What it covers |
|-------|----------------|
| [Google OAuth + Gmail](docs/integrations/google-oauth-gmail.md) | Cloud Console project, consent screen, redirect URIs, offline access & refresh-token lifetime, scopes, rate limits |
| [OpenAI](docs/integrations/openai.md) | API key, strict JSON schema outputs, prompt construction & injection defense, cost notes |
| [Resend](docs/integrations/resend.md) | Optional sender, domain verification, sandbox limitations, from-address resolution order |
| [Upstash Redis](docs/integrations/upstash-redis.md) | REST database creation, exact key schema, why Redis and not Postgres |
| [Vercel Cron](docs/integrations/vercel-cron.md) | Schedule config, automatic `CRON_SECRET` header, execution budget, monitoring |

---

## Deploying to Vercel

1. Push this repo to GitHub and import it at [vercel.com/new](https://vercel.com/new).
2. Add **all** environment variables from `.env.example` in *Settings → Environment Variables* (Production + Preview). Use your production `NEXTAUTH_URL`.
3. Add the production callback URI `https://YOUR-DOMAIN/api/auth/callback/google` to the Google OAuth client.
4. `vercel.json` already registers the schedule — no extra step needed:

```json
{ "crons": [{ "path": "/api/cron/poll", "schedule": "*/5 * * * *" }] }
```

5. Deploy. Vercel automatically calls the endpoint every 5 minutes and attaches `Authorization: Bearer ${CRON_SECRET}` when a `CRON_SECRET` env var exists.

> ⚠️ **Plan requirement:** Vercel's Hobby plan restricts cron jobs to **once per day**. A `*/5 * * * *` schedule requires the Pro plan (or run the curl command above from any external scheduler).

---

## API reference

### `GET /api/cron/poll`

Protected by `Authorization: Bearer $CRON_SECRET` (401 otherwise). Runs the whole workflow and returns a per-message audit trail:

```json
{
  "success": true,
  "processedCount": 2,
  "results": [
    { "userId": "108…", "messageId": "18c9f…", "status": "sent",
      "detail": "replied to priya@example.com" },
    { "userId": "108…", "messageId": "18ca1…", "status": "skipped",
      "detail": "candidate email not found, left unlabeled for manual review" }
  ]
}
```

### `GET | POST | PATCH /api/settings`

Session-guarded (401 without login). The update body is validated with a strict Zod schema — unknown keys and bad types get a 400 naming the offending field; internal failures return a generic 500 (details go to server logs only).

```json
PATCH /api/settings
{ "jobLabelName": "careers-inbox", "replyMethod": "resend", "resendFromEmail": "hire@yourdomain.com" }
```

Response envelope: `{ "success": true, "data": { …UserSettings } }`.

---

## Design system

All visual tokens are defined once in [`tailwind.config.ts`](tailwind.config.ts) and enforced app-wide:

| Token class | Values |
|-------------|--------|
| Backgrounds | `base #0d0d0d` · `panel #161616` · `panel-2 #1c1c1c` · `panel-3 #242424` |
| Lines & type | `border #2a2a2a` · `text #e8e8e8` · `text-muted #8a8a8a` · `text-faint #5c5c5c` |
| Semantic | `accent #e07856` (terracotta, sparingly) · `success #3ecf5e` · `danger #e5484d` |
| Type scale | body `13.5px` · h1 `22px/600` · label/sub/eyebrow `12.5px` · th `12px` — system-ui stack only |
| Radii | cards `8px` (`rounded-card`) · controls `6px` (`rounded-control`) |

Hard rules enforced in [`app/globals.css`](app/globals.css):

- `* { box-shadow: none !important }` — depth comes **only** from 1px borders and background contrast; no gradients either.
- Focus states shift the border color to terracotta — never a glow ring.
- Layout: fixed 260px sidebar + fluid main column with 32–48px padding; card rows separated by internal 1px borders, never margin gaps.

---

## Security model

- **Least surprise about identity:** the AI is instructed that the `From` header may be a forwarder; the reply target must come from the body/signature.
- **Prompt-injection containment:** untrusted subject/body are wrapped in `<untrusted_email>` tags; the system prompt declares that content DATA-only and forbids obeying instructions inside it even when they claim system/admin/AI-provider authority.
- **Secrets hygiene:** every credential is read from `process.env`; helpers throw `Missing env var: X` at call time. `.env*` files are git-ignored.
- **Cron endpoint:** bearer-secret gated; returns 401 on any mismatch, so the public URL cannot be invoked anonymously.
- **Fail-safe ordering:** label applied strictly after successful send → no double-sends; non-applications labeled to stop re-analysis loops; missing-address cases left visible instead of dropped.
- **API hardening:** settings endpoint validates shape with Zod, logs errors server-side, and returns generic messages to clients.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `Missing env var: X` at startup | Variable not set where the process runs | Add to `.env.local` (dev) or Vercel env vars (prod), restart |
| Cron returns 401 | `CRON_SECRET` unset/mismatched | Vercel injects the header only when `CRON_SECRET` exists as an env var; for local curls pass it manually |
| Nothing gets labeled/replied | Job label name mismatch between Gmail and Settings | Labels are matched by **exact name** — check Dashboard → Settings |
| `invalid_grant` in logs | Refresh token expired — Google issues 7-day tokens while the OAuth app is in **Testing** mode | Publish the app (or re-login weekly); see the Google guide |
| Replies go out but never twice | Expected — label applied after send | — |
| Message stuck pending forever | Usually "no candidate email extracted" — check poll JSON detail | Add the address to the signature/body or handle manually |
| 403 on `messages.modify` after re-consent | Old grant predates scope fix | Sign out and sign in again (`prompt=consent` forces fresh scopes) |

---

## Known limitations

- **Testing-mode tokens expire** after 7 days until the Google app is published (see integration guide).
- Poll processes up to **20 messages per user per run** (fits the 60s function budget); large backlogs drain over consecutive runs.
- AI output is parsed with `JSON.parse(...) as JobApplicationAnalysis` — runtime Zod validation of model responses is a recommended follow-up (see developer guide roadmap).
- The dashboard's "Replied" query does not yet wrap its Gmail calls in `withRetry`.
- `npm run lint` expects ESLint to be installed (`npx eslint .` deps not included in `package.json`).
- No automated tests yet; smoke-testing is done via the documented curl flow.

---

## Documentation index

| Document | Purpose |
|----------|---------|
| [`docs/configuration.md`](docs/configuration.md) | Every env var, where to obtain it, plus `tsconfig` / `tailwind` / `next.config` / `postcss` / `vercel.json` references |
| [`docs/third-party-integrations.md`](docs/third-party-integrations.md) | Integration map, failure-handling matrix, links to deep dives |
| [`docs/integrations/google-oauth-gmail.md`](docs/integrations/google-oauth-gmail.md) | Full Google/Gmail setup + internals |
| [`docs/integrations/openai.md`](docs/integrations/openai.md) | AI analysis contract + safety |
| [`docs/integrations/resend.md`](docs/integrations/resend.md) | Alternate sending path |
| [`docs/integrations/upstash-redis.md`](docs/integrations/upstash-redis.md) | Token/settings store schema |
| [`docs/integrations/vercel-cron.md`](docs/integrations/vercel-cron.md) | Scheduler contract & operations |
| [`docs/developer-guide.md`](docs/developer-guide.md) | Codebase tour, data flows, conventions, extension recipes |
