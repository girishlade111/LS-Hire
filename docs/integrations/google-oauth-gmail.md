# Google OAuth + Gmail API

The core integration. Google provides both **identity** (sign-in) and the **mailbox automation surface** (search, read, label, send).

- [1. What we use it for](#1-what-we-use-it-for)
- [2. Scopes requested](#2-scopes-requested)
- [3. One-time setup in Google Cloud Console](#3-one-time-setup-in-google-cloud-console)
- [4. Offline access & refresh tokens](#4-offline-access--refresh-tokens)
- [5. Code internals](#5-code-internals)
- [6. Quotas & limits](#6-quotas--limits)
- [7. Error playbook](#7-error-playbook)

---

## 1. What we use it for

| Capability | Gmail API call | Where |
|------------|----------------|-------|
| Sign users in | OAuth 2.0 (via NextAuth Google provider) | `lib/auth.ts` |
| Find pending applications | `users.messages.list` with `q=label:{jobLabel} -label:{processedLabel}` | `lib/gmail/messages.ts` |
| Read full email | `users.messages.get` (`format: "full"`) + recursive MIME walk | `lib/gmail/messages.ts` |
| Mark processed / dedupe | `users.labels.list/create` + `users.messages.modify` | `lib/gmail/labels.ts` |
| Send threaded reply | `users.messages.send` with raw RFC 2822 + `threadId` | `lib/gmail/send.ts` |

## 2. Scopes requested

Defined once in [`lib/gmail/client.ts`](../../lib/gmail/client.ts) as `GMAIL_SCOPES`, joined into a single string for NextAuth:

```
openid
email
profile
https://www.googleapis.com/auth/gmail.modify
```

Why `gmail.modify`: it is the *real* Google scope that grants read access **plus** label changes (`messages.modify`) **plus** sending — exactly the three mailbox powers Hire needs. The Gmail API has no standalone `gmail.labels` scope; requesting `gmail.readonly`+`gmail.send` alone would make every `messages.modify` call fail with 403, breaking dedupe entirely.

> If your account consented to an older scope set, sign out and sign back in — `prompt=consent` forces Google to re-issue a grant covering current scopes.

## 3. One-time setup in Google Cloud Console

1. **Create project** — [console.cloud.google.com](https://console.cloud.google.com) → project picker → *New project*.
2. **Enable APIs** — APIs & Services → Library → enable **Gmail API**.
3. **OAuth consent screen** — APIs & Services → OAuth consent screen:
   - User type: **External**.
   - Add scopes: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `.../auth/gmail.modify`.
   - Add each user's Google address under **Test users** while iterating.
4. **Create credentials** — Credentials → *Create credentials* → OAuth client ID → **Web application**:
   - Authorized redirect URIs:
     - `http://localhost:3000/api/auth/callback/google`
     - `https://YOUR-PRODUCTION-DOMAIN/api/auth/callback/google`
5. Copy the client ID/secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

### Verification vs Testing mode

Because `gmail.modify` is a **restricted/sensitive** scope:

| Mode | Works for | Refresh token lifetime |
|------|-----------|------------------------|
| **Testing** (default) | Up to 100 explicitly added test users | ⚠️ **7 days**, then `invalid_grant` → users must re-login |
| **In production** (published, verified or unverified-with-warning) | Anyone | Indefinite until revoked |

For real multi-user deployment, publish the app through verification, or accept weekly re-consent during development.

## 4. Offline access & refresh tokens

Two authorization params are mandatory and set in [`lib/auth.ts`](../../lib/auth.ts):

```ts
authorization: {
  params: {
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline", // ← makes Google return a refresh_token
    prompt: "consent"       // ← forces reissue even on repeat logins
  }
}
```

Without these, Google returns only a ~1-hour access token and the serverless cron would be locked out of the mailbox.

Persistence rules implemented in the `signIn` callback:

- The refresh token is saved to Redis (`user:{userId}` hash) **only when actually present** — repeat logins without a fresh token never overwrite the stored one with `undefined`.
- Canonical user id = `account.providerAccountId` (Google's stable `sub`), also propagated onto the JWT/session as `session.user.id`.
- `googleapis` refreshes short-lived access tokens automatically on every API call using the stored refresh token — no expiry math in our code.

## 5. Code internals

### Client factory — `lib/gmail/client.ts`

```ts
getGmailClientForUser(refreshToken)
```

Builds an `OAuth2` client with app credentials + the user's refresh token, returns `google.gmail({ version: "v1", auth })`. Cheap to call per-request; stateless.

### Search & parse — `lib/gmail/messages.ts`

- Query: `` `label:${jobLabelName} -label:${processedLabelName}` `` — this label arithmetic **is** the dedupe mechanism; there is no tracking DB.
- `maxResults: 20` per run per user (fits the 60s cron budget).
- Body extraction: recursive descent over `payload.parts` preferring `text/plain`; falls back to `text/html` stripped of `<style>`/`<script>`/tags/entities. Bodies are base64url-decoded (normalized to standard base64 first so `-`/`_` aren't dropped).
- Output type `ParsedGmailMessage { id, threadId, subject, fromHeader, bodyText, hasAttachment }`. Note the doc comment on `fromHeader`: on forwarded applications it's the forwarder, never trusted as the reply target.

### Labels & dedupe — `lib/gmail/labels.ts`

- `getOrCreateLabelId()` matches by **exact name** (so Settings values must match Gmail spelling), creating the label with sensible visibility if absent.
- `applyLabel()` resolves the id then calls `messages.modify({ addLabelIds: [id] })`. Called **only after** a successful send (or for non-applications). Failed sends stay unlabeled → retried next run automatically.

### Threaded replies — `lib/gmail/send.ts`

Builds a raw RFC 2822 message:

```
To: {candidate}
Subject: Re: {subject}        ← "Re:" added if missing
Content-Type: text/plain; charset=utf-8
In-Reply-To: {originalId}     ← threading headers when available
References: {originalId}

{AI reply body}
```

base64url-encoded, sent via `users.messages.send` with the original `threadId` so Gmail threads it under the application.

## 6. Quotas & limits

Gmail API quota is consumed per user (250 quota units/second/user default):

| Call | Units |
|------|-------|
| `messages.list` | 5 |
| `messages.get` | 5 |
| `messages.send` | 25 |
| `messages.modify` | 10 |

At ≤20 messages/run the math is comfortable; bursts are absorbed by `withRetry` (429/503 backoff).

## 7. Error playbook

| Error | Meaning | Resolution |
|-------|---------|------------|
| `invalid_grant` | Refresh token expired/revoked | Re-login; publish the OAuth app to escape 7-day testing tokens |
| `403 insufficientPermissions` on modify/send | Stale consent from before scope fix | Sign out + sign in (`prompt=consent`) |
| `404` message not found | Mail deleted between list & get | Harmless — surfaced as error row, gone next run |
| Label never created | Name mismatch vs Settings | Labels match by exact name — align them |
| 429/503 storms | Rate limiting | Automatic backoff; persistent failures appear as `status:"error"` rows |
