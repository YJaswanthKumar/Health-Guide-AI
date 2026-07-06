---
name: Auth token getter not wired up
description: setAuthTokenGetter was exported but never called — all customFetch API calls sent no Authorization header, causing 401 on every authenticated route.
---

# Auth Token Getter Not Wired Up

## The Problem
`lib/api-client-react/src/custom-fetch.ts` exports `setAuthTokenGetter` to allow callers to register a Clerk JWT getter. If it is never called, `_authTokenGetter` stays `null` and every `customFetch` request goes out with no `Authorization` header — the backend returns 401 for all authenticated routes.

## The Fix
Added `ClerkAuthTokenRegistrar` component to `artifacts/vitalguide/src/App.tsx`, mounted inside `ClerkProvider` alongside `ClerkQueryClientCacheInvalidator`:

```tsx
import { setAuthTokenGetter } from "@workspace/api-client-react";

function ClerkAuthTokenRegistrar() {
  const { getToken } = useAuth();
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);
  return null;
}
```

Mounted inside `ClerkProvider > QueryClientProvider` before `AppRoutes`.

**Why:** Without this, the module-level `_authTokenGetter` in custom-fetch.ts is always null, so no Bearer token is attached to any generated API hook call.

**How to apply:** Any time authenticated API calls all return 401 and no Authorization header appears in the network tab, check that `setAuthTokenGetter` has been registered. This component must be inside `ClerkProvider` so `useAuth()` works.
