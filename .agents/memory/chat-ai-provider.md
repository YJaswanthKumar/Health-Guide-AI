---
name: Chat AI provider
description: Which AI SDK powers the chat routes and why it was switched
---

The chat route (`artifacts/api-server/src/routes/chat.ts`) was migrated from Google Gemini (`@google/genai`) to OpenAI (`openai` package, GPT-4o-mini) because the user did not have a `GEMINI_API_KEY` but did have `OPENAI_API_KEY`.

**Why:** Gemini SDK is still a devDependency in `artifacts/api-server/package.json` but is no longer imported in chat.ts. If switching back to Gemini, restore the `getAI()` factory and the `generateContentStream` call pattern (role mapping: `assistant` → `model`).

**How to apply:** When adding new AI features, use `new OpenAI({ apiKey: process.env.OPENAI_API_KEY })` directly in the route file. Do not use `lib/integrations-openai-ai-server` — it requires `AI_INTEGRATIONS_OPENAI_BASE_URL` which is not set.

**Security fixes also applied in this file:**
- `GET /chat/conversations/:id/messages` — now verifies conversation ownership before returning messages (prevents IDOR)
- `DELETE /chat/conversations/:id` — now verifies ownership first, then deletes conversation; messages cascade via FK (`onDelete: "cascade"` in messages schema)
