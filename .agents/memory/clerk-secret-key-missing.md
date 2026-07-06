---
name: Missing CLERK_SECRET_KEY causes blank/frozen signed-in pages
description: Root cause pattern for "blank preview" bugs where the app looks fine logged-out but breaks after sign-in
---

If the app renders fine signed-out but any signed-in page appears blank, frozen, or stuck loading, check whether `CLERK_SECRET_KEY` is registered as a Replit Secret (not just present in a git-tracked `.env` file).

**Why:** Clerk's Express middleware throws `Missing Clerk Secret Key` and returns a raw 500 HTML error page for every authenticated API request when the secret isn't loaded as a real env var. The frontend then gets non-JSON 500 responses on every protected fetch, which typically manifests as blank sections or infinite loading spinners rather than an obvious error — easy to misdiagnose as a frontend bug.

**How to apply:** When investigating a "blank preview"/"frozen after login" report, first `curl` a protected backend endpoint directly (e.g. `/api/users/profile`) and check for a 401 (correct, secret present) vs. a raw 500 HTML stack trace (secret missing/not loaded). Cross-check with `viewEnvVars` — secrets sitting only in `.env` do not count; they must be registered as actual Replit Secrets for the process env to see them.
