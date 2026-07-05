# VitalGuide — Multi-Agent Build Progress

> **Last updated:** July 5, 2026  
> **Status:** ✅ Phase 1 complete — Multi-agent Care Companion + Task Manager live  
> **Both workflows running:** Backend API (port 8080) · Frontend (port 5000)

---

## 🎯 Project Goal

Transform VitalGuide from a single-LLM architecture into a **multi-agent CrewAI platform** with:
1. **Task Manager** — visible on Dashboard + Plan Tracker, CRUD managed by Agent 3
2. **Care Companion Widget** — top of Dashboard, proactive AI caretaker chat powered by Agent 3

Five CrewAI agents are deployed externally. Agent calls **always go through the backend** — never from the frontend.

---

## 🤖 CrewAI Agent Registry

| Key | Name | URL | Token |
|-----|------|-----|-------|
| `agent1` | Health Assessment Check-Up | `https://agent-1-health-assessment-check-up-intellig-1dc82804.crewai.com` | `e4e8b0ade661` |
| `agent2` | Health Assessment v1 | `https://agent-2-health-assessment-v1-f8f3c084-83c5--699b282f.crewai.com` | `9291998bc791` |
| `agent3` | Intelligent Care Planner | `https://agent-3-intelligent-care-planner-21e241b6-5-4dc6483c.crewai.com` | `d8fa917bc5bb` |
| `agent4` | Emergency Navigator | `https://agent-4-emergency-navigator-agent-v1-395711-fc767e98.crewai.com` | `428828ceb133` |
| `agent5` | NutriWise Nutrition Intelligence | `https://agent-5-nutriwise-nutrition-intelligence-ra-57fa0f34.crewai.com` | `7f4bfc5ea7e6` |

**Agent API pattern:**
```
POST /kickoff  →  { inputs: {...} }  →  returns { kickoff_id }
GET  /status/{kickoff_id}  →  poll until state === "SUCCESS"  →  returns result
```
Auth: `Authorization: Bearer <token>` header on every request.

All agent config lives in: `artifacts/api-server/src/lib/agentRouter.ts`

---

## ✅ Completed Work

### Phase 0 — Foundation
- [x] pnpm monorepo running with Node 24 + TypeScript 5.9
- [x] Clerk auth (CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY) configured with `/api/__clerk` proxy
- [x] GEMINI_API_KEY set; DATABASE_URL Replit-managed
- [x] DB schema: users, plans, logs, conversations, messages, documents all working

### Phase 1 — Multi-Agent Integration ✅

#### Database
- [x] `lib/db/src/schema/tasks.ts` — tasks table created
- [x] `lib/db/src/schema/companion.ts` — companion_messages table created
- [x] `lib/db/src/schema/index.ts` — exports both new tables
- [x] DB pushed (`pnpm --filter @workspace/db run push` succeeded)

#### Backend
- [x] `artifacts/api-server/src/lib/agentRouter.ts` — kickoff + polling + type exports
- [x] `artifacts/api-server/src/routes/tasks.ts` — full CRUD + `/agent-refresh` (calls Agent 3)
- [x] `artifacts/api-server/src/routes/companion.ts` — /messages, /latest, /message, /proactive
- [x] `artifacts/api-server/src/routes/index.ts` — mounts `/tasks` and `/companion` routes

#### Frontend
- [x] `artifacts/vitalguide/src/components/companion/CareCompanionWidget.tsx` — gradient banner on Dashboard; shows Agent 3's proactive message; navigates to `/companion`
- [x] `artifacts/vitalguide/src/components/tasks/TodayTasksWidget.tsx` — on Dashboard; add/complete/delete tasks + "AI Plan" button
- [x] `artifacts/vitalguide/src/components/tasks/TaskListPanel.tsx` — on Plan Tracker right column; filter tabs (all/pending/done)
- [x] `artifacts/vitalguide/src/pages/CompanionPage.tsx` — full chat UI with Agent 3; `/companion` route
- [x] `artifacts/vitalguide/src/pages/DashboardPage.tsx` — updated: CareCompanionWidget + TodayTasksWidget added at top
- [x] `artifacts/vitalguide/src/pages/PlannerPage.tsx` — updated: TaskListPanel in right column
- [x] `artifacts/vitalguide/src/App.tsx` — added `/companion` route
- [x] `artifacts/vitalguide/src/components/layout/AppLayout.tsx` — "Care Companion" added to sidebar + mobile nav

---

## 🔲 Pending / Next Steps

### Phase 2 — Connect Remaining Agents

| Priority | Feature | Agent | Status |
|----------|---------|-------|--------|
| HIGH | Health Checkup → Agent 1 pipeline | agent1 | ❌ Not started |
| HIGH | Emergency detection → Agent 4 | agent4 | ❌ Not started |
| MEDIUM | Nutrition Q&A → Agent 5 (Educate page) | agent5 | ❌ Not started |
| MEDIUM | Health Assessment v1 → Agent 2 | agent2 | ❌ Not started |
| LOW | Care Companion uses Agent 3 result to auto-create tasks on login | agent3 | Partial (only when user sends msg) |

### Phase 3 — Polish & UX
- [ ] Task recurrence scheduling (daily/weekly tasks auto-reset)
- [ ] Notifications / reminders for overdue tasks
- [ ] Agent 3 health score + compliance score displayed on Dashboard
- [ ] Dashboard aggregate stats (weekly adherence, task completion %)
- [ ] Error state UX when agent times out (currently shows toast)

### Phase 4 — Deployment
- [ ] `pnpm --filter @workspace/db run push` on production DB before deploying
- [ ] Set all env vars in Replit deployment secrets
- [ ] Test Clerk proxy URL in production environment

---

## 🗄️ Database Schema Summary

### `tasks` table
```
id              serial PRIMARY KEY
clerkUserId     text NOT NULL
title           text NOT NULL
description     text
category        text DEFAULT 'general'   -- medication | hydration | exercise | nutrition | general
priority        text DEFAULT 'medium'    -- high | medium | low
dueTime         text                     -- e.g. "08:00 AM"
recurrence      text                     -- daily | weekly | none
status          text DEFAULT 'pending'   -- pending | in_progress | completed
completed       boolean DEFAULT false
sourceAgent     text                     -- 'agent3' | 'user'
createdAt       timestamp DEFAULT now()
updatedAt       timestamp DEFAULT now()
```

### `companion_messages` table
```
id              serial PRIMARY KEY
clerkUserId     text NOT NULL
role            text NOT NULL            -- 'user' | 'assistant'
content         text NOT NULL
createdAt       timestamp DEFAULT now()
```

---

## 🗺️ Where Things Live

### Backend
| File | Purpose |
|------|---------|
| `artifacts/api-server/src/lib/agentRouter.ts` | All agent URLs, tokens, kickoff/poll logic, type definitions |
| `artifacts/api-server/src/routes/tasks.ts` | Task CRUD + agent-refresh endpoint |
| `artifacts/api-server/src/routes/companion.ts` | Care Companion chat endpoints |
| `artifacts/api-server/src/routes/index.ts` | Route mounts |

### Frontend
| File | Purpose |
|------|---------|
| `artifacts/vitalguide/src/components/companion/CareCompanionWidget.tsx` | Dashboard banner widget |
| `artifacts/vitalguide/src/components/tasks/TodayTasksWidget.tsx` | Dashboard tasks widget |
| `artifacts/vitalguide/src/components/tasks/TaskListPanel.tsx` | Planner sidebar task panel |
| `artifacts/vitalguide/src/pages/CompanionPage.tsx` | Full companion chat page |
| `artifacts/vitalguide/src/pages/DashboardPage.tsx` | Main dashboard (updated) |
| `artifacts/vitalguide/src/pages/PlannerPage.tsx` | Plan tracker (updated) |
| `artifacts/vitalguide/src/App.tsx` | Routes (updated) |
| `artifacts/vitalguide/src/components/layout/AppLayout.tsx` | Nav (updated) |

### DB / API Spec
| File | Purpose |
|------|---------|
| `lib/db/src/schema/tasks.ts` | Tasks table schema |
| `lib/db/src/schema/companion.ts` | Companion messages table schema |
| `lib/db/src/schema/index.ts` | Re-exports all tables |

---

## 🔧 How to Resume Work

### Run the app
```bash
# Terminal 1 — Backend
PORT=8080 pnpm --filter @workspace/api-server run dev

# Terminal 2 — Frontend
PORT=22608 pnpm --filter @workspace/vitalguide run dev
```

### After any schema changes
```bash
pnpm --filter @workspace/db run push
```

### After any route changes
Restart the `Backend API` workflow — it rebuilds via esbuild on start.

### To add a new agent route
1. Add handler in `artifacts/api-server/src/routes/`
2. Import + mount in `artifacts/api-server/src/routes/index.ts`
3. Call `invokeAgent("agentN", inputs, timeoutMs)` from `agentRouter.ts`
4. Restart Backend API workflow

---

## ⚠️ Known Quirks / Gotchas

- **Agent 3 response parsing:** Output may have message in `dashboard_companion.message`, `.question`, `.greeting`, or `.proactive_message` — all four are checked with fallback.
- **Agent timeout:** Set to 90 seconds for Care Companion; agents can be slow on cold start. Fallback responses are always in place.
- **Proactive message caching:** Companion widget checks `/api/companion/latest` first; only calls `/proactive` if last message is >4 hours old.
- **Task `sourceAgent`:** Value is `"agent3"` for AI-generated tasks, `"user"` for manual — used to show the "AI" badge in the UI.
- **Frontend auth:** All fetch calls use `credentials: "include"` — Clerk session cookie handles auth; no explicit token needed.
- **Clerk proxy:** `VITE_CLERK_PROXY_URL=/api/__clerk` — must stay this way for Replit's proxied domain to work.
- **Tailwind:** `tailwindcss({ optimize: false })` in vite.config.ts — required for Clerk themes.
- **React Query hooks:** All generated hooks require explicit `queryKey` in options (TS2741 otherwise).

---

## 📋 Session Log

| Date | What was done |
|------|--------------|
| Jul 5, 2026 | Phase 0 foundation already in place; Phase 1 multi-agent integration completed: DB schema, backend routes, agent router, all 4 frontend components + 1 page, Dashboard + Planner + App + AppLayout all updated. Both workflows confirmed running. |
