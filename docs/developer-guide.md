# Developer guide

Everything a new engineer needs to be productive in this codebase: how it's organized, how data flows, the rules the code follows, and recipes for common changes.

- [1. Getting started](#1-getting-started)
- [2. Repository layout](#2-repository-layout)
- [3. Core flows](#3-core-flows)
- [4. Module reference](#4-module-reference)
- [5. Conventions & house rules](#5-conventions--house-rules)
- [6. Recipes: common changes](#6-recipes-common-changes)
- [7. Testing & debugging](#7-testing--debugging)
- [8. Roadmap / known gaps](#8-roadmap--known-gaps)

---

## 1. Getting started

```bash
npm install
cp .env.example .env.local   # fill values — see docs/configuration.md
npm run dev                  # http://localhost:3000
npm run build                # type-checked production build (CI gate)
```

Requirements: Node 18+, a Google OAuth client with Gmail modify scope (see [`integrations/google-oauth-gmail.md`](integrations/google-oauth-gmail.md)), an Upstash REST database, an OpenAI key.

## 2. Repository layout

```
app/                        # Next.js App Router
  page.tsx                    public login screen (honest "why Google sign-in" copy)
  dashboard/page.tsx          Applications list — pending + replied, queried live from Gmail
  dashboard/settings/         label names + persona form → PATCH /api/settings
  dashboard/reply-method/     gmail vs resend chooser + from-address field
  api/auth/[...nextauth]/     NextAuth handler (GET+POST)
  api/cron/poll/route.ts    ★ the workflow engine — start reading here
  api/settings/route.ts       session-guarded settings API (GET/POST/PATCH, Zod)
components/                 Button · Card(+CardHeader) · Primitives(Badge/Input/Select/Toggle)
                            SettingsRow · Sidebar · SignInButton
lib/
  retry.ts                    withRetry() — shared backoff wrapper
  auth.ts                     NextAuthOptions (scopes, offline consent, token persistence)
  redis/{client,tokens,settings}.ts
  gmail/{client,types,messages,labels,send}.ts
  ai/{client,types,analyze}.ts
  resend/{client,send}.ts
types/next-auth.d.ts          session.user.id augmentation
docs/                         this documentation set
```

## 3. Core flows

### 3.1 Sign-in flow

```
Browser → /api/auth/signin/google → Google consent
        → callback /api/auth/callback/google
        → NextAuth signIn callback:
             refresh_token present? → saveUserToken({userId: providerAccountId,
                                                    email, refreshToken}) to Redis
        → JWT callback stamps token.userId
        → session callback exposes session.user.id
```

Key details:

- `access_type=offline` + `prompt=consent` are what actually produce refresh tokens.
- The stored token is only overwritten when a fresh one exists (never `undefined`).
- `types/next-auth.d.ts` makes `session.user.id` typed everywhere without casts.

### 3.2 Cron flow (`app/api/cron/poll/route.ts`)

1. **Auth** — bearer secret check; 401 on any mismatch.
2. **Enumerate users** — `listActiveUserIds()` from Redis; Redis failure here returns 500 (nothing else can proceed).
3. **Per user** (own try/catch): load token → load settings → `listUnprocessedApplications()` → iterate messages.
4. **Per message** (own try/catch) via `processMessage()`:
   - `analyzeJobApplication()` → structured result.
   - Not an application → apply processed label → `skipped` row.
   - Application without candidate email → **no label**, warn log, `skipped` row ("manual review").
   - Otherwise send (Resend path first resolves from-address and throws if unconfigured) → **only after successful send**, apply processed label → `sent` row.
5. Return `{ success, processedCount, results[] }`.

The ordering invariant — *label strictly after send* — is what makes retries safe and duplicates impossible under normal operation.

### 3.3 Dashboard read path

`app/dashboard/page.tsx` is a server component: session guard → Redis token lookup → two Gmail queries:

- Pending: same query as cron (`label:{job} -label:{processed}`).
- Replied: messages carrying the processed label, fetched with `format:"metadata"` for light Subject/From headers.

No application data is persisted locally; refreshing the page re-reads Gmail.

## 4. Module reference

| Module | Exports | Notes |
|--------|---------|-------|
| `lib/retry.ts` | `withRetry<T>(fn, {retries=3, baseDelayMs=1000, label})` | Backoff 1s→2s→4s; retryable = status undefined/429/503 |
| `lib/gmail/client.ts` | `GMAIL_SCOPES`, `getGmailClientForUser(refreshToken)` | googleapis auto-refreshes access tokens |
| `lib/gmail/messages.ts` | `listUnprocessedApplications(refreshToken, jobLabel, processedLabel)` | Recursive MIME walk; base64url-safe decode; HTML fallback stripping |
| `lib/gmail/labels.ts` | `getOrCreateLabelId`, `applyLabel` | Exact-name match; creation is lazy (first apply) |
| `lib/gmail/send.ts` | `sendGmailReply({refreshToken,to,subject,body,threadId,inReplyToMessageId?})` | Adds `Re:` prefix when missing; RFC2822 + In-Reply-To/References threading |
| `lib/resend/send.ts` | `sendResendReply({to,subject,body,fromEmail})` | Converts SDK `{error}` result into thrown Error |
| `lib/ai/analyze.ts` | `analyzeJobApplication({companyName,hrPersonaPrompt,subject,bodyText})` | gpt-4o strict json_schema; anti-injection framing |
| `lib/redis/tokens.ts` | `saveUserToken/getUserToken/listActiveUserIds/removeUser` | Hash `user:{id}`, set `users:active` |
| `lib/redis/settings.ts` | `getUserSettings/saveUserSettings`, `DEFAULTS`, types | Merge-over-defaults normalization |

## 5. Conventions & house rules

1. **Every external API call goes through `withRetry`.** Label the call (`{ label: "gmail.send" }`) so logs identify the upstream.
2. **Env vars only via requireEnv-style helpers** that throw `Missing env var: X`. Never silently default credentials.
3. **Strict TS is real:** `noUncheckedIndexedAccess` means index reads are `T | undefined` — guard them (`choices[0]?.message?.content`). No `any`; no non-null assertions where a guard will do.
4. **Isolation:** one unit of work = one try/catch + one contextual log line (`userId`, `messageId`). Never let loops crash the batch.
5. **Dedupe invariant:** never write UI/API logic that marks work done before its side effect succeeded.
6. **Untrusted content stays tagged:** any new AI feature must keep email text inside `<untrusted_email>` framing with the DATA-only rule.
7. **Design tokens only:** no raw hex, no shadows, no gradients. Use the Tailwind tokens from `tailwind.config.ts`; global CSS already bans box-shadows and styles focus states.
8. **Comments:** explain *why* (invariants, provider quirks), not *what*.

## 6. Recipes: common changes

### Add a new user setting (end-to-end)

1. `lib/redis/settings.ts` — extend `UserSettings` + `DEFAULTS` + normalize logic.
2. `app/api/settings/route.ts` — add the key to `settingsUpdateSchema` (Zod, `.strict()`).
3. UI — add a `SettingsRow` control in `/dashboard/settings` or `/dashboard/reply-method`.
4. Consumer — read it off `settings` wherever needed (cron route already loads full settings per user).
5. Docs — update `docs/configuration.md` if env-dependent, or this file's schema table.

### Add a third reply provider (e.g. Postmark)

1. `lib/postmark/client.ts` + `lib/postmark/send.ts` mirroring `resend/*`, wrapped in `withRetry`.
2. Extend `ReplyMethod` union in `lib/redis/settings.ts` **and** the Zod enum in the settings route **and** the chooser UI in `/dashboard/reply-method`.
3. Branch in `processMessage()` next to the existing resend/gmail split.
4. Remember the contract: throw *before* side effects if config is missing; label only after success.

### Change the AI output schema

1. Update all three places together: JSON schema literal in `lib/ai/analyze.ts`, interface in `lib/ai/types.ts`, system-prompt task/rules text.
2. Keep strict-mode constraints: every property required, `additionalProperties:false`, nullables as `["string","null"]`.
3. Handle the new fields' downstream semantics in `processMessage()`.

### Raise the per-run message cap

`maxResults: 20` lives in `lib/gmail/messages.ts`. Before raising it, budget latency: ~20 msgs × (get + analyze + send + label) must fit `maxDuration = 60`; otherwise paginate across runs instead.

## 7. Testing & debugging

Current state: no automated test suite; verification is build + live smoke tests.

**Smoke-test checklist**

```bash
npm run build                                   # types + compile
curl -H "Authorization: Bearer $CRON_SECRET" \
     localhost:3000/api/cron/poll               # inspect results[] rows
```

Then verify in Gmail: reply arrived threaded, original carries the processed label; dashboard reflects both lists.

**Local debugging tips**

- Seed Redis manually via Upstash console (`users:active` + `user:{id}`) if you need cron without signing in.
- Grep logs by prefix: `[cron/poll]`, `[withRetry]`, `[dashboard]`.
- To re-trigger a message during testing, remove the processed label from it in Gmail — it becomes pending again instantly (that's the dedupe design).
- A 401 from the endpoint means header/secret mismatch — echo both sides before blaming code.

## 8. Roadmap / known gaps

Ranked by expected value:

1. **Zod-validate AI output** — replace `JSON.parse(...) as JobApplicationAnalysis` in `lib/ai/analyze.ts` with a schema parse so malformed model responses fail loudly with field context.
2. **Wrap dashboard Gmail reads in `withRetry`** — `fetchProcessedRows()` in `app/dashboard/page.tsx` currently calls the API directly.
3. **Pagination/backlog drain** — process >20/run or use `pageToken` loops within budget.
4. **Offboarding UX** — surface `removeUser()` behind an account action instead of manual Redis surgery.
5. **Install ESLint** (`eslint` + `eslint-config-next`) so `npm run lint` works out of the box; wire into CI alongside `npm run build`.
6. **Tests** — unit tests for pure helpers (`buildRawMessage`, MIME extraction, retry classification) and a mocked end-to-end cron test.
7. **Email-format hardening** — richer HTML→text conversion, attachment-aware replies.
