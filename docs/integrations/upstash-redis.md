# Upstash Redis integration

Upstash Redis (REST protocol) is Hire's **only** datastore. It exists for exactly one architectural reason: OAuth refresh tokens must be readable by a serverless cron function that runs with no browser session and no shared memory — and it must work across Vercel's stateless, multi-instance functions. A REST-accessible Redis is the lightest tool that satisfies this.

**What Redis does NOT do:** application/dedupe tracking stays 100% in Gmail labels; there is no SQL database anywhere in the project.

- [1. Setup](#1-setup)
- [2. Key schema](#2-key-schema)
- [3. Code map](#3-code-map)
- [4. Data lifecycle](#4-data-lifecycle)
- [5. Operational notes](#5-operational-notes)

---

## 1. Setup

1. Create a free/paid database at [console.upstash.com](https://console.upstash.com) — choose **REST** API type (Upstash databases expose REST by default) and a region near your Vercel deployment.
2. From the database dashboard copy:
   - `UPSTASH_REDIS_REST_URL` — e.g. `https://your-db-1234.upstash.io`
   - `UPSTASH_REDIS_REST_TOKEN` — long bearer token
3. Put both into `.env.local` / Vercel env vars.

The client ([`lib/redis/client.ts`](../../lib/redis/client.ts)) uses `@upstash/redis`, which speaks HTTPS REST — no TCP connections, which is what makes it serverless-safe.

```ts
export function getRedis(): Redis {
  if (!instance) {
    instance = new Redis({
      url: requireEnv("UPSTASH_REDIS_REST_URL"),
      token: requireEnv("UPSTASH_REDIS_REST_TOKEN")
    });
  }
  return instance;
}
```

It's a **lazy** singleton: env validation happens on first use rather than at import, so importing modules never requires vars to be set (this keeps `next build` page-data collection working without credentials).

## 2. Key schema

| Key | Type | Fields / members | Written by | Read by |
|-----|------|------------------|------------|---------|
| `user:{userId}` | hash | `email`, `refreshToken` | NextAuth `signIn` callback (`lib/redis/tokens.ts`) | Cron route, dashboard |
| `users:active` | set | one member per connected userId | same | Cron route (`listActiveUserIds`) |
| `settings:{userId}` | hash | `replyMethod`, `jobLabelName`, `processedLabelName`, `hrPersonaPrompt`, `resendFromEmail?` | `/api/settings` POST/PATCH (`lib/redis/settings.ts`) | Cron route, settings pages |

Conventions:

- `userId` = Google's stable `sub` claim (`account.providerAccountId`), not the email address.
- No TTLs are set — tokens live until revoked or `removeUser()` is called. Google may invalidate them server-side (testing-mode expiry); the app surfaces that as an error row + log line rather than deleting data.
- Settings reads merge over `DEFAULTS`, so partially-written or brand-new users always get a complete config (defaults: reply method `gmail`, labels `job-applications`/`auto-replied`, built-in HR persona text).

## 3. Code map

### `lib/redis/tokens.ts`

```ts
saveUserToken(user: StoredUser): Promise<void>   // hset user:{id} + sadd users:active
getUserToken(userId): Promise<StoredUser | null> // null when no refreshToken stored
listActiveUserIds(): Promise<string[]>           // smembers users:active
removeUser(userId): Promise<void>                // del key + srem from set
```

### `lib/redis/settings.ts`

```ts
getUserSettings(userId): Promise<UserSettings>            // hgetall → normalize over DEFAULTS
saveUserSettings(userId, partial): Promise<UserSettings>  // read-merge-write, returns full record
```

`normalize()` validates `replyMethod` against the literal union and falls back to defaults field-by-field, so corrupt/partial hashes can never produce a half-configured workflow.

## 4. Data lifecycle

| Event | Redis effect |
|-------|--------------|
| User completes Google sign-in (fresh `refresh_token` present) | Token saved, id added to active set |
| Repeat sign-in without new refresh token | Stored token **not** overwritten (guard in `lib/auth.ts` signIn callback) |
| User edits labels/persona/method | Settings hash merged & rewritten via `/api/settings` |
| Offboarding (manual today) | Call `removeUser(userId)` to delete token + remove from active set |

## 5. Operational notes

- **Why not Postgres?** The spec'd architecture needs exactly two tiny records per user with zero relational queries; REST Redis removes connection pooling entirely — the #1 pain of SQL in serverless.
- **Security:** the REST token grants full DB access — treat it like a password; it's env-only and git-ignored. Values include OAuth refresh tokens, so enable Upstash's TLS (default) and consider evictions disabled (default on persistent plans).
- **Latency:** every cron run performs ~2 reads/user before touching Gmail — negligible vs AI/Gmail latency.
- **Backups/eviction:** Upstash default eviction policy is fine here; losing Redis just means users re-sign-in — Gmail labels (the real state) survive independently by design.
