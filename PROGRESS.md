# VitalGuide — Multi-Agent Build Progress

> **Last updated:** July 6, 2026  
> **Status:** ✅ P0 Preview stability fixed — `CLERK_SECRET_KEY` was missing from Replit Secrets, causing every authenticated backend request to crash with a 500 (Clerk `assertValidSecretKey` error), which made signed-in pages appear blank/frozen. Secret added, both workflows restarted clean. Added a global `ErrorBoundary` around the app as a safety net against future blank-page regressions. All major routes (landing, sign-in, sign-up, dashboard, checkup, planner, educate, profile, companion) verified rendering without console errors.  
> **Status:** ✅ Phase 3 Education Page complete — Agent 5 (NutriWise) integrated for all education conversations; Gemini fallback on timeout; non-streaming `EducationChatPanel` with 30-90s thinking indicator; IDOR + mode guards on backend; TS7006 errors resolved.  
> **Both workflows running:** Backend API (port 8080) · Frontend (port 5000)

---

## 🎯 Project Goal

Transform VitalGuide from a single-LLM architecture into a **multi-agent CrewAI platform** with:
1. **Task Manager** — visible on Dashboard + Plan Tracker, CRUD managed by Agent 3 ✅
2. **Care Companion Widget** — top of Dashboard, proactive AI caretaker chat powered by Agent 3 ✅
3. **Health Checkup** — conversational symptom assessment via Agent 2, emergency via Agent 4, nutrition via Agent 5, care plan via Agent 3 ✅

Five CrewAI agents deployed externally. Agent calls **always go through the backend** — never from frontend.

---

## 🤖 CrewAI Agent Registry

| Key | Name | URL | Token |
|-----|------|-----|-------|
| `agent1` | Health Assessment Check-Up (v1, unused) | `https://agent-1-health-assessment-check-up-intellig-1dc82804.crewai.com` | `e4e8b0ade661` |
| `agent2` | Health Assessment (conversational) | `https://agent-2-health-assessment-v1-f8f3c084-83c5--699b282f.crewai.com` | `9291998bc791` |
| `agent3` | Intelligent Care Planner | `https://agent-3-intelligent-care-planner-21e241b6-5-4dc6483c.crewai.com` | `d8fa917bc5bb` |
| `agent4` | Emergency Navigator | `https://agent-4-emergency-navigator-agent-v1-395711-fc767e98.crewai.com` | `428828ceb133` |
| `agent5` | NutriWise Nutrition Intelligence | `https://agent-5-nutriwise-nutrition-intelligence-ra-57fa0f34.crewai.com` | `7f4bfc5ea7e6` |

**Agent API pattern:**
```
POST /kickoff  →  { inputs: {...} }  →  returns { kickoff_id }
GET  /status/{kickoff_id}  →  poll until state === "SUCCESS"  →  returns result
Auth: Authorization: Bearer <token>
```
All agent config lives in: `artifacts/api-server/src/lib/agentRouter.ts`

---

## ✅ Completed Work

### Phase 0 — Foundation
- [x] pnpm monorepo running with Node 24 + TypeScript 5.9
- [x] Clerk auth configured with `/api/__clerk` proxy
- [x] GEMINI_API_KEY, DATABASE_URL, CLERK keys all set
- [x] DB schema: users, plans, logs, conversations, messages, documents

### Phase 1 — Task Manager + Care Companion ✅

#### Database
- [x] `lib/db/src/schema/tasks.ts` — tasks table
- [x] `lib/db/src/schema/companion.ts` — companion_messages table
- [x] Both pushed to DB

#### Backend
- [x] `artifacts/api-server/src/lib/agentRouter.ts` — kickoff + polling + types
- [x] `artifacts/api-server/src/routes/tasks.ts` — CRUD + `/agent-refresh` (Agent 3)
- [x] `artifacts/api-server/src/routes/companion.ts` — /messages, /latest, /message, /proactive

#### Frontend
- [x] `CareCompanionWidget.tsx` — gradient banner on Dashboard
- [x] `TodayTasksWidget.tsx` — Dashboard task widget
- [x] `TaskListPanel.tsx` — Plan Tracker sidebar
- [x] `CompanionPage.tsx` — full chat with Agent 3 at `/companion`
- [x] DashboardPage, PlannerPage, App.tsx, AppLayout.tsx all updated

### Phase 2 — Health Checkup Multi-Agent ✅

#### Database
- [x] `lib/db/src/schema/conversations.ts` — added `checkupAssessment` JSONB column
- [x] Column pushed to DB (`checkup_assessment`)

#### Backend
- [x] `artifacts/api-server/src/routes/checkup.ts` — new agent-powered checkup route
  - `POST /api/checkup-agent/conversations/:id/message` — main checkup flow
  - `GET /api/checkup-agent/conversations/:id/assessment` — fetch stored assessment
- [x] `artifacts/api-server/src/routes/index.ts` — mounts `/checkup-agent`

#### Frontend
- [x] `artifacts/vitalguide/src/components/checkup/AssessmentCard.tsx` — full assessment display
- [x] `artifacts/vitalguide/src/components/checkup/EmergencyBanner.tsx` — emergency alert with Agent 4 data
- [x] `artifacts/vitalguide/src/components/checkup/ProfileUpdateDialog.tsx` — profile update confirmation dialog
- [x] `artifacts/vitalguide/src/components/checkup/CheckupChatInterface.tsx` — agent-powered chat
- [x] `artifacts/vitalguide/src/pages/CheckupPage.tsx` — updated to use CheckupChatInterface

### Phase 3 — Education Page Agent 5 Integration ✅

#### Backend
- [x] `artifacts/api-server/src/routes/education.ts` — new education agent route
  - `POST /api/education-agent/conversations/:id/message`
  - Calls Agent 5 (NutriWise Nutrition Intelligence) with user profile + conversation history + topic
  - Extracts response from multiple possible Agent 5 output shapes (`response`, `message`, `answer`, `content`, structured fields)
  - Falls back to Gemini 2.5 Flash if Agent 5 times out or fails
  - Mode guard: rejects non-`education` conversations with 400
  - IDOR guard: ownership verified before read/write
- [x] `artifacts/api-server/src/routes/index.ts` — mounts `/education-agent`

#### Frontend
- [x] `artifacts/vitalguide/src/pages/EducatePage.tsx` — replaced SSE `ChatInterface` with `EducationChatPanel`
  - Non-streaming JSON pattern (matches Agent 5's kickoff+poll response time of 30-90s)
  - Animated **"Agent 5 is researching your question…"** indicator during wait
  - Optimistic user message shown immediately, replaced with DB messages on success
  - Dismissible error banner on failure
  - `autoPrompt` fires once per conversation — clicking a topic card creates conversation + auto-sends starter message to Agent 5
  - Correct TypeScript types throughout: `EduConvo = Conversation & { updatedAt?: string | null }` extension type

#### No database changes
Education conversations reuse the existing `conversations` + `messages` tables (same schema as checkup/planner). No migrations needed.

---

## 🔄 Data Flow — Health Checkup

```
User types symptoms
        ↓
POST /api/checkup-agent/conversations/:id/message
        ↓
  [Backend: Agent Router]
        ↓
  Invoke Agent 2 (Health Assessment)
  - Inputs: user_message, conversation_history, user_profile, 
            medical_conditions, medications, allergies, medical_docs
        ↓
  ┌─────────────────────────────────────────────┐
  │  FOLLOW_UP?                                  │
  │  → Save follow-up question as assistant msg  │
  │  → Return { status: "follow_up" }            │
  │  → Frontend shows question, waits for reply  │
  └─────────────────────────────────────────────┘
        ↓ (if ASSESSMENT_COMPLETE)
  Parallel orchestration:
  ├── Agent 4 (Emergency Navigator) — if severity === "emergency"
  ├── Agent 5 (NutriWise) — if nutrition recs present
  └── Agent 3 (Care Planner) — if recovery plan needed
        ↓
  Save assessment to conversations.checkup_assessment (JSONB)
  Create tasks from Agent 3 output
  Save assistant summary message
        ↓
  Return structured JSON:
  { assessment, emergencyData, nutritionData, newTasks, profileSuggestions }
        ↓
Frontend:
  - AssessmentCard: possible_causes, recovery, food, medication, doctor, warning_signs
  - EmergencyBanner: first aid, hospitals, specialists, contacts (if emergency)
  - ProfileUpdateDialog: confirm/reject AI profile suggestions (never auto-update)
  - Task count badge: shows how many tasks Agent 3 created
```

---

## 🗄️ Database Schema Summary

### `conversations` table (updated)
```
checkupAssessment   jsonb   -- stores { assessment, emergencyData, nutritionData } when complete
```

### `tasks` table
```
id, clerkUserId, title, description, category, priority, dueTime, recurrence,
status, completed, sourceAgent ('agent3'|'user'), createdAt, updatedAt
```

### `companion_messages` table
```
id, clerkUserId, role ('user'|'assistant'), content, createdAt
```

---

## 🗺️ API Routes Reference

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/checkup-agent/conversations/:id/message` | Send message to Agent 2, orchestrate agents |
| GET | `/api/checkup-agent/conversations/:id/assessment` | Fetch stored assessment for conversation |
| GET | `/api/tasks` | List user tasks |
| POST | `/api/tasks` | Create task manually |
| PATCH | `/api/tasks/:id/complete` | Mark task complete |
| DELETE | `/api/tasks/:id` | Delete task |
| POST | `/api/tasks/agent-refresh` | Invoke Agent 3 to refresh task plan |
| GET | `/api/companion/messages` | Full companion conversation history |
| GET | `/api/companion/latest` | Latest companion message (for widget) |
| POST | `/api/companion/message` | Send to Agent 3, get reply + optional tasks |
| POST | `/api/companion/proactive` | Generate proactive check-in (4hr cache) |

---

## 🗺️ File Map

### Backend
| File | Purpose |
|------|---------|
| `artifacts/api-server/src/lib/agentRouter.ts` | All agent config, kickoff/poll logic, type exports |
| `artifacts/api-server/src/routes/checkup.ts` | Agent 2 health assessment + Agent 4/5/3 orchestration |
| `artifacts/api-server/src/routes/tasks.ts` | Task CRUD + agent-refresh |
| `artifacts/api-server/src/routes/companion.ts` | Care Companion chat |
| `artifacts/api-server/src/routes/index.ts` | All route mounts |

### Frontend
| File | Purpose |
|------|---------|
| `artifacts/vitalguide/src/components/checkup/CheckupChatInterface.tsx` | Agent-powered checkup chat (replaces ChatInterface for checkup) |
| `artifacts/vitalguide/src/components/checkup/AssessmentCard.tsx` | Full assessment result display |
| `artifacts/vitalguide/src/components/checkup/EmergencyBanner.tsx` | Emergency alert with Agent 4 data |
| `artifacts/vitalguide/src/components/checkup/ProfileUpdateDialog.tsx` | Profile update confirmation |
| `artifacts/vitalguide/src/components/companion/CareCompanionWidget.tsx` | Dashboard banner widget |
| `artifacts/vitalguide/src/components/tasks/TodayTasksWidget.tsx` | Dashboard tasks |
| `artifacts/vitalguide/src/components/tasks/TaskListPanel.tsx` | Planner sidebar task panel |
| `artifacts/vitalguide/src/pages/CheckupPage.tsx` | Health Checkup page (updated) |
| `artifacts/vitalguide/src/pages/CompanionPage.tsx` | Full companion chat |
| `artifacts/vitalguide/src/pages/DashboardPage.tsx` | Dashboard (updated) |
| `artifacts/vitalguide/src/pages/PlannerPage.tsx` | Plan Tracker (updated) |
| `artifacts/vitalguide/src/App.tsx` | Routes |
| `artifacts/vitalguide/src/components/layout/AppLayout.tsx` | Nav |

### DB / Schema
| File | Purpose |
|------|---------|
| `lib/db/src/schema/conversations.ts` | Added checkupAssessment JSONB column |
| `lib/db/src/schema/tasks.ts` | Tasks table |
| `lib/db/src/schema/companion.ts` | Companion messages table |

---

## ⚠️ Known Quirks / Gotchas

### Agent Output Parsing
- Agent 2 output checked for FOLLOW_UP vs ASSESSMENT_COMPLETE via multiple field names (`status`, `assessment_complete`, `complete`, presence of `assessment` object)
- Agent outputs parsed defensively — `extractAssessment()` and `extractFollowUp()` in `checkup.ts` handle multiple possible field name schemas
- If agent returns raw string, it's JSON.parse'd; if that fails, stored as `{ raw_text }`

### Timing
- Agents take 30–90 seconds to respond (cold start can be longer)
- Agent 4, 5, 3 run in parallel via `Promise.allSettled` after assessment complete
- Each has 90 second timeout; failures are logged but don't block the response

### Profile Updates
- Profile update suggestions from Agent 2 are NEVER applied automatically
- `ProfileUpdateDialog` shows a confirmation before calling PUT /api/users/profile
- Dialog normalizes camelCase key names before sending to API

### Assessment Persistence
- Stored in `conversations.checkup_assessment` JSONB column after assessment complete
- On page load/conversation switch, `GET /api/checkup-agent/conversations/:id/assessment` fetches it
- CheckupChatInterface shows the AssessmentCard and EmergencyBanner from stored data

### Emergency Fallback
- If Agent 4 fails, a hardcoded fallback emergency response is shown (call 911, stay calm)
- Never blocks the assessment from being returned

### Care Companion Caching
- Proactive message is cached 4 hours per user (checks `companion_messages` createdAt)
- Widget shows last assistant message, only calls `/proactive` if stale

### React Query hooks
- All generated hooks require explicit `queryKey` in options (TS2741 otherwise)
- Chat hooks: `useGetConversationMessages(id, { query: { queryKey: getGetConversationMessagesQueryKey(id) } })`

### Tailwind
- `tailwindcss({ optimize: false })` in vite.config.ts — required for Clerk themes
- `@layer theme, base, clerk, components, utilities;` must appear before `@import "tailwindcss"` in index.css

---

## 🔲 Remaining Work

### Phase 3 — Polish & UX (not started)
- [ ] Task recurrence — daily/weekly tasks auto-reset at midnight
- [ ] Push notifications / reminders for overdue tasks
- [ ] Agent 3 health score + compliance score on Dashboard
- [ ] Dashboard aggregate stats (weekly adherence %)
- [ ] Educate page: hook Agent 5 for nutrition Q&A specifically
- [ ] Agent 1 (Health Assessment v1) — currently unused, could be used for initial symptom triage

### Phase 4 — Deployment
- [ ] `pnpm --filter @workspace/db run push` on production DB
- [ ] Set all env vars in Replit deployment secrets
- [ ] Test Clerk proxy URL in production

---

## 🔧 How to Resume Work

### Run the app
```bash
# Terminal 1 — Backend (port 8080)
PORT=8080 pnpm --filter @workspace/api-server run dev

# Terminal 2 — Frontend (port 5000)
PORT=22608 pnpm --filter @workspace/vitalguide run dev
```

### After any schema changes
```bash
pnpm --filter @workspace/db run push
```

### After any backend route/code changes
Restart the `Backend API` workflow (it rebuilds via esbuild on start).

### To add a new agent endpoint
1. Add handler in `artifacts/api-server/src/routes/<name>.ts`
2. Import + mount in `artifacts/api-server/src/routes/index.ts`  
3. Call `invokeAgent("agentN", inputs, timeoutMs)` from `agentRouter.ts`
4. Restart Backend API workflow

### To test Health Checkup flow manually
1. Sign in, complete onboarding
2. Go to `/checkup` → New Checkup Session
3. Type "I have a severe headache, fever of 103°F, and stiff neck" (tests emergency path)
4. Wait 30–90s for Agent 2 to respond with follow-up or assessment
5. If assessment completes: AssessmentCard appears below chat
6. If emergency: EmergencyBanner appears at top, Agent 4 data populated
7. If profile suggestions: ProfileUpdateDialog appears (must confirm to apply)
8. Check Dashboard — new tasks from Agent 3 should appear

---

## 📋 Session Log

| Date | What was done |
|------|--------------|
| Jul 5, 2026 | Phase 1: DB schema (tasks + companion), agent router, tasks/companion routes, CareCompanionWidget, TodayTasksWidget, TaskListPanel, CompanionPage, DashboardPage/PlannerPage/App/AppLayout all updated. Both workflows confirmed running. |
| Jul 5, 2026 | Phase 2: conversations.checkup_assessment JSONB column, checkup.ts backend route (Agent 2 conversational + Agent 4/5/3 parallel orchestration), AssessmentCard, EmergencyBanner, ProfileUpdateDialog, CheckupChatInterface, CheckupPage updated. DB pushed. Both workflows running. |
| Jul 5, 2026 | Re-import into fresh Replit environment: ran `pnpm install`, moved `CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY`/`GEMINI_API_KEY` into Replit Secrets (were previously sitting as plaintext values in the git-tracked `.env`), added `.env`/`.env.*` to `.gitignore`, pushed DB schema, restarted both workflows, verified landing page renders. |
| Jul 6, 2026 | **P0 fix:** diagnosed "blank preview" — backend's Clerk auth middleware was crashing every authenticated request with a 500 (`Missing Clerk Secret Key`) because `CLERK_SECRET_KEY` had been dropped from Replit Secrets after re-import. Requested and set the secret, restarted Backend API + Start application (also cleared a stale process holding port 8080). Verified `/api/users/profile` now returns 401 (correct) instead of 500. Added `ErrorBoundary.tsx` wrapping the whole app in `main.tsx` as a safety net against future blank-page regressions. Screenshotted and confirmed all major routes (`/`, `/sign-in`, `/sign-up`, `/checkup`, `/dashboard`) render cleanly with no console errors. Full `pnpm run typecheck` passes. |
| Jul 6, 2026 | Phase 3 Education Page: created `artifacts/api-server/src/routes/education.ts` — POST `/api/education-agent/conversations/:id/message`, calls Agent 5 (NutriWise) with user profile + conversation history, falls back to Gemini on timeout; mode guard enforces education-only access. Replaced `ChatInterface` (SSE) in `EducatePage.tsx` with `EducationChatPanel` (JSON, non-streaming) — shows animated "Agent 5 is researching…" indicator during 30-90s wait, optimistic user messages, graceful error banner. Fixed TS7006 implicit-any errors throughout EducatePage.tsx. Both workflows running. |
