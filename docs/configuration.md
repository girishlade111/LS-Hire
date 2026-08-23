# Configuration reference

Every knob Hire reads lives in environment variables or in four config files. This document lists all of them, where each value comes from, and what breaks if it is wrong.

- [1. Environment variables](#1-environment-variables)
- [2. Where to obtain each value](#2-where-to-obtain-each-value)
- [3. Local setup (.env.local)](#3-local-setup-envlocal)
- [4. Vercel environment variables](#4-vercel-environment-variables)
- [5. vercel.json (cron)](#5-verceljson-cron)
- [6. tailwind.config.ts (design tokens)](#6-tailwindconfigts-design-tokens)
- [7. tsconfig.json](#7-tsconfigjson)
- [8. next.config.mjs & postcss.config.mjs](#8-nextconfigmjs--postcssconfigmjs)
- [9. package.json scripts](#9-packagejson-scripts)

---

## 1. Environment variables

The canonical list lives in [`.env.example`](../.env.example). Copy it to `.env.local` for local development.

| Variable | Required | Used by | Purpose |
|----------|----------|---------|---------|
| `NEXTAUTH_URL` | ✅ | NextAuth | Base URL of the app. Used to build OAuth redirect URLs (`{NEXTAUTH_URL}/api/auth/callback/google`). `http://localhost:3000` locally, your domain in production. |
| `NEXTAUTH_SECRET` | ✅ | NextAuth | Signs/encrypts JWT session cookies. Generate with `openssl rand -base64 32`. |
| `GOOGLE_CLIENT_ID` | ✅ | NextAuth + Gmail client factory | OAuth client ID from Google Cloud Console. |
| `GOOGLE_CLIENT_SECRET` | ✅ | NextAuth + Gmail client factory | Paired OAuth client secret. |
| `OPENAI_API_KEY` | ✅ | `lib/ai/client.ts` | Key used for the gpt-4o analysis call. |
| `UPSTASH_REDIS_REST_URL` | ✅ | `lib/redis/client.ts` | REST endpoint of your Upstash database — the only datastore (tokens + settings). |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ | `lib/redis/client.ts` | Bearer token authenticating Redis REST calls. |
| `RESEND_API_KEY` | ⚠️ conditional | `lib/resend/client.ts` | Only required when a user sets reply method to **Resend**. |
| `RESEND_FROM_EMAIL` | ⚠️ conditional | Cron route fallback | Default From address when the user has not set a personal one in settings. Must be on a Resend-verified domain. |
| `CRON_SECRET` | ✅ | `/api/cron/poll`, Vercel scheduler | Shared secret. The route requires `Authorization: Bearer ${CRON_SECRET}`; Vercel attaches this header automatically when the variable exists under exactly this name. |
| `COMPANY_NAME` | recommended | AI prompt | Injected into the system prompt ("You are the AI hiring assistant for {COMPANY_NAME}"). Falls back to `"Our Company"` if unset — not an error, but replies read better with a real name. |

**Failure behavior:** env access goes through small `requireEnv()` helpers that throw ``Missing env var: X`` at call time. The three external clients (`redis`, `openai`, `resend`) are **lazy singletons** built on first use — a missing variable crashes the first request that needs it with a clear message instead of producing `undefined` deep inside a call chain (and keeps `next build` runnable without credentials).

---

## 2. Where to obtain each value

| Variable | Where to get it |
|----------|-----------------|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud Console → APIs & Services → Credentials → *Create OAuth client ID* (type: Web application). Full walkthrough: [`integrations/google-oauth-gmail.md`](integrations/google-oauth-gmail.md) |
| `OPENAI_API_KEY` | platform.openai.com → API keys |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | console.upstash.com → create a REST database → copy from the dashboard's *.env* tab |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | resend.com → API keys / Domains (must verify the sending domain) |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` (or any long random string) |

---

## 3. Local setup (.env.local)

```bash
cp .env.example .env.local
```

Then fill in values and restart `npm run dev`. `.env.local` is git-ignored (see `.gitignore`) — never commit real secrets.

Minimal working local example:

```dotenv
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=some-long-random-string
GOOGLE_CLIENT_ID=1234-abcd.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-…
OPENAI_API_KEY=sk-…
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=AX…=
CRON_SECRET=another-random-string
COMPANY_NAME=Lade Stack
```

---

## 4. Vercel environment variables

Project → Settings → Environment Variables. Add every key from `.env.example` to **Production** (and Preview if you want branch deployments to work). Notes:

- Set `NEXTAUTH_URL` to the final production URL *before* first login, or Google will reject the redirect.
- `CRON_SECRET` must exist under exactly that name so Vercel's scheduler auto-injects `Authorization: Bearer <value>` into cron calls.
- Changing env vars triggers a new deployment — redeploy after edits.

---

## 5. vercel.json (cron)

[`vercel.json`](../vercel.json):

```json
{
  "crons": [
    {
      "path": "/api/cron/poll",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

- `path` must match the API route exactly.
- `schedule` uses standard crontab syntax (UTC). `*/5 * * * *` = every 5 minutes.
- **Hobby plan caveat:** Vercel limits cron schedules on Hobby to once per day; `*/5` requires Pro. Alternative: call the endpoint from GitHub Actions/external cron with the bearer header.
- Vercel sends a **GET** request; only `GET` is implemented on the route.

---

## 6. tailwind.config.ts (design tokens)

The entire visual language is encoded here — no colors, fonts, or shadows outside these tokens are allowed anywhere in `app/` or `components/`.

### Colors

| Token | Hex | Tailwind class examples | Usage rule |
|-------|-----|------------------------|------------|
| `base` | `#0d0d0d` | `bg-base` | Page background (never pure black) |
| `panel` | `#161616` | `bg-panel` | Card background |
| `panel-2` | `#1c1c1c` | `bg-panel-2` | Buttons/inputs at rest, hover surfaces |
| `panel-3` | `#242424` | `bg-panel-3` | Elevated/hover state |
| `border` | `#2a2a2a` | `border-border` | All 1px lines — sole source of depth |
| `text` | `#e8e8e8` | `text-text` | Primary text (never pure white) |
| `text-muted` | `#8a8a8a` | `text-text-muted` | Secondary text |
| `text-faint` | `#5c5c5c` | `text-text-faint` | Tertiary/decorative text |
| `accent` | `#e07856` | `text-accent`, `border-accent` | Terracotta — focus rings, selection, sparing emphasis |
| `success` | `#3ecf5e` | `text-success` | "Replied" badge, positive states |
| `danger` | `#e5484d` | `text-danger` | "Pending" badge, destructive actions |

### Font sizes

| Token | Spec |
|-------|------|
| `body` | 13.5px / weight 400 (base body text) |
| `h1` | 22px / weight 600 |
| `label` | 12.5px / weight 500 (section labels — muted color, never uppercase) |
| `sub` · `eyebrow` | 12.5px / weight 400 |
| `th` | 12px / weight 500 |

Font family: system-ui stack only — `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`.

### Radii

`card` = 8px, `control` = 6px.

### Enforced globally (app/globals.css)

- `* { box-shadow: none !important }` — no elevation via shadow anywhere.
- Focus: `outline: none` + border-color shifts to `accent`.
- `::selection`: terracotta background, base-colored text.

---

## 7. tsconfig.json

Key compiler options and why they matter here:

| Option | Value | Consequence |
|--------|-------|-------------|
| `strict` | `true` | Full null-check discipline across all Gmail/OpenAI response handling |
| `noUncheckedIndexedAccess` | `true` | Array/object index reads return `T \| undefined` — every `choices[0]`, `headers[i]` etc. is explicitly guarded (you'll see `?.` chains throughout `lib/`) |
| `paths` | `"@/*": ["./*"]` | Root-relative imports like `@/lib/retry` work from anywhere |
| `target` / `lib` | ES2017-era defaults + DOM | Server routes run on Node; Buffer/base64 helpers come from `@types/node` |
| `jsx` | `preserve` | Next.js owns JSX transformation |

---

## 8. next.config.mjs & postcss.config.mjs

- `next.config.mjs` — minimal: `reactStrictMode: true`. No custom webpack, no image domains needed.
- `postcss.config.mjs` — standard Tailwind pipeline:

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

Tailwind content globs scan `./app/**/*.{ts,tsx}` and `./components/**/*.{ts,tsx}` — add new component directories there if you create them.

---

## 9. package.json scripts

| Script | Command | Notes |
|--------|---------|-------|
| `dev` | `next dev` | Local dev server on :3000 |
| `build` | `next build` | Runs type checking automatically; fails on TS errors |
| `start` | `next start` | Serve the production build locally |
| `lint` | `next lint` | Requires ESLint packages to be installed first (`npx next lint` will offer to install them); not included in devDependencies by default |

Dependency pins of record: `next@14.2.15` (exact), `next-auth@^4.24.7`, `googleapis@^140.0.1`, `openai@^4.63.0`, `resend@^4.0.0`, `@upstash/redis@^1.34.0`, `zod@^3.23.8`, `tailwindcss@^3.4.0`, `typescript@^5.5.4`.
