---
name: Chat AI provider
description: Which AI SDK powers the chat routes and why it was switched
---

The chat route (`artifacts/api-server/src/routes/chat.ts`) uses **Google Gemini 2.5 Flash** via `@google/genai` with `GEMINI_API_KEY`. Role mapping: `assistant` → `model` for Gemini's content format.

**Why:** User has both GEMINI_API_KEY and OPENAI_API_KEY. Gemini is the primary AI for all chat modes (checkup, planner, education). OpenAI is available in `lib/integrations-openai-ai-server` for document extraction but requires `AI_INTEGRATIONS_OPENAI_BASE_URL` — use the `openai` package directly with `OPENAI_API_KEY` for any new OpenAI features.

**How to apply:** When adding new AI chat features, extend the existing `getAI()` factory in chat.ts. For new OpenAI features, instantiate `new OpenAI({ apiKey: process.env.OPENAI_API_KEY })` directly — do NOT use `lib/integrations-openai-ai-server`.

**Security fixes also applied in this file:**
- `GET /chat/conversations/:id/messages` — now verifies conversation ownership before returning messages (prevents IDOR)
- `DELETE /chat/conversations/:id` — now verifies ownership first, then deletes conversation; messages cascade via FK (`onDelete: "cascade"` in messages schema)
