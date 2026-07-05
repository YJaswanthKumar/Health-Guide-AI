---
name: Clerk env setup for Replit re-import
description: How to fix Clerk JS load failures after importing this project into a fresh Replit workspace.
---

# Clerk Environment Setup

## The Problem
After a fresh import/re-import, `pnpm install` is not run and no secrets are configured. Two failures occur:
1. `node_modules` missing → both workflows fail immediately.
2. `CLERK_PUBLISHABLE_KEY` missing → `publishableKeyFromHost()` derives a bad `https://clerk.<replit-domain>` URL and Clerk JS fails to load.

## The Fix

### Step 1 — Install dependencies
```bash
pnpm install  # from workspace root
```

### Step 2 — Set the Clerk publishable key (public — safe as env var)
Use `setEnvVars({ environment: "shared", values: { CLERK_PUBLISHABLE_KEY: "pk_test_...", VITE_CLERK_PUBLISHABLE_KEY: "pk_test_..." } })`.
Both names are needed: `CLERK_PUBLISHABLE_KEY` for the API server, `VITE_CLERK_PUBLISHABLE_KEY` as the Vite-define alias.

### Step 3 — Request secrets
Use `requestSecrets` for `CLERK_SECRET_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`.
Without `CLERK_SECRET_KEY` the backend returns 500 on every request.

## Code changes made to harden this
- `artifacts/vitalguide/src/App.tsx`: removed `publishableKeyFromHost` (internal Clerk API) and now reads `import.meta.env.VITE_CLERK_PUBLISHABLE_KEY` directly.
- `artifacts/vitalguide/vite.config.ts`: now throws at build time if neither `VITE_CLERK_PUBLISHABLE_KEY` nor `CLERK_PUBLISHABLE_KEY` is set, instead of silently falling back to `""`.

**Why:** `publishableKeyFromHost` with an empty key + Replit hostname constructed a `clerk.<hostname>` satellite proxy URL, causing Clerk JS to fail to load. Explicit read + fail-fast avoids this entirely.

## Remaining secrets to add
- `CLERK_SECRET_KEY` — backend Clerk middleware (currently 500s without it)
- `GEMINI_API_KEY` — AI chat features
- `OPENAI_API_KEY` — document extraction
- Agent tokens — currently hardcoded in `agentRouter.ts` (tracked as tech debt task)

## Dev vs Production proxy
- `clerkProxyMiddleware` in `app.ts` is **disabled in dev** (`NODE_ENV !== "production"`).
- Do NOT set `VITE_CLERK_PROXY_URL` in dev — leave it empty.
- In production, set it to `https://<prod-domain>/api/__clerk`.
