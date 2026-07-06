---
name: Education Page Agent 5 route
description: How education conversations are handled — Agent 5 kickoff+poll with Gemini fallback, non-streaming frontend panel
---

# Education Page — Agent 5 Integration

## The rule
Education conversations use `POST /api/education-agent/conversations/:id/message` (JSON, not SSE). The endpoint calls Agent 5 (NutriWise) and falls back to Gemini if Agent 5 times out. The backend enforces `convo.mode === "education"` before processing.

**Why:** Agent 5 uses a kickoff+poll pattern (30-90s); SSE streaming from ChatInterface is incompatible. A dedicated non-streaming endpoint + frontend panel keeps the two flows independent.

## How to apply
- Frontend: `EducationChatPanel` in `EducatePage.tsx` — calls the education-agent endpoint, shows "Agent 5 is researching…" indicator, handles optimistic messages + error banner.
- Backend: `artifacts/api-server/src/routes/education.ts` — mounted at `/api/education-agent` in `routes/index.ts`.
- Do NOT route education mode through `/api/chat/conversations/:id/messages` (that uses SSE + Gemini only).

## EduConvo type extension
`Conversation` from generated API does not include `updatedAt`. Use `type EduConvo = Conversation & { updatedAt?: string | null }` in EducatePage.tsx for sort/filter callbacks.
