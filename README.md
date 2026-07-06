# VitalGuide 🩺

> Your trusted AI-powered health companion — understand symptoms, track care plans, and learn about nutrition and wellness.

VitalGuide is a full-stack, personalized health management app powered by a **five-agent CrewAI platform** and Google Gemini 2.5 Flash. Users complete a health profile on onboarding, which is injected into every AI conversation for truly personalized responses.

---

## ✨ Features

| Feature | Agent | Description |
|---|---|---|
| **Health Checkup** | Agent 2 + 4 + 5 + 3 | Conversational symptom assessment → parallel orchestration: emergency nav (Agent 4), nutrition advice (Agent 5), care plan (Agent 3). Assessment stored per conversation. |
| **Plan Tracker** | Agent 3 | Manage medication, diet, and fitness plans. Agent 3 creates and refreshes task plans. |
| **Health Education** | Agent 5 + Gemini fallback | Evidence-based health topics powered by Agent 5 (NutriWise). Conversation history persists. Falls back to Gemini 2.5 Flash if Agent 5 is unavailable. |
| **Care Companion** | Agent 3 | Proactive health assistant widget on Dashboard. Full conversation at `/companion`. |
| **Task Manager** | Agent 3 | Today's tasks on Dashboard and Plan Tracker sidebar. Agent-generated or user-created. |
| **Daily Logs** | — | Track mood, sleep, water intake, food, symptoms, and medications each day. |
| **Onboarding Profile** | — | 3-step profile setup (personal info → health conditions → goals) feeds every AI prompt. |
| **Medical Documents** | — | Upload and store medical records; summaries are injected into Checkup AI context. |

---

## 🏗️ Project Structure

```
vitalguide/                         ← Monorepo root
│
├── artifacts/
│   ├── api-server/                 ← Express 5 backend (port 8080)
│   │   ├── src/
│   │   │   ├── app.ts              ← Express app setup (CORS, Clerk, logging)
│   │   │   ├── index.ts            ← Server entry point
│   │   │   ├── lib/
│   │   │   │   └── logger.ts       ← Pino structured logger
│   │   │   ├── middlewares/
│   │   │   │   └── clerkProxyMiddleware.ts  ← Clerk whitelabel proxy
│   │   │   └── routes/
│   │   │       ├── index.ts        ← Route aggregator
│   │   │       ├── health.ts       ← GET /api/healthz
│   │   │       ├── users.ts        ← GET/POST /api/users/profile
│   │   │       ├── plans.ts        ← CRUD /api/plans
│   │   │       ├── logs.ts         ← GET/POST /api/logs, GET /api/logs/today
│   │   │       ├── chat.ts         ← SSE streaming AI chat /api/chat/*
│   │   │       ├── documents.ts    ← Medical documents /api/documents
│   │   │       ├── checkup.ts      ← Agent 2+4+5+3 checkup orchestration /api/checkup-agent/*
│   │   │       ├── education.ts    ← Agent 5 education chat /api/education-agent/*
│   │   │       ├── tasks.ts        ← Task CRUD + Agent 3 refresh /api/tasks/*
│   │   │       └── companion.ts    ← Care Companion chat /api/companion/*
│   │   ├── build.mjs               ← esbuild bundler script
│   │   └── package.json
│   │
│   ├── vitalguide/                 ← React + Vite frontend (port 5000)
│   │   ├── src/
│   │   │   ├── App.tsx             ← Root: ClerkProvider, router, TanStack Query
│   │   │   ├── main.tsx            ← React DOM entry
│   │   │   ├── index.css           ← Tailwind v4 + Clerk layer declarations
│   │   │   ├── pages/
│   │   │   │   ├── LandingPage.tsx
│   │   │   │   ├── DashboardPage.tsx
│   │   │   │   ├── OnboardingPage.tsx
│   │   │   │   ├── CheckupPage.tsx
│   │   │   │   ├── PlannerPage.tsx
│   │   │   │   ├── EducatePage.tsx
│   │   │   │   └── ProfilePage.tsx
│   │   │   ├── components/
│   │   │   │   ├── layout/
│   │   │   │   │   └── AppLayout.tsx    ← Sidebar + nav shell
│   │   │   │   ├── chat/
│   │   │   │   │   └── ChatInterface.tsx ← SSE streaming chat UI
│   │   │   │   └── ui/                  ← shadcn/ui component library
│   │   │   ├── hooks/              ← Custom React hooks
│   │   │   └── lib/
│   │   │       └── queryClient.ts  ← TanStack Query config
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   └── mockup-sandbox/             ← Isolated UI component preview server
│
├── lib/
│   ├── api-spec/                   ← OpenAPI 3.1 source of truth
│   │   └── openapi.yaml            ← All route/schema definitions
│   ├── api-client-react/           ← TanStack Query hooks (Orval-generated)
│   │   └── src/generated/api.ts
│   ├── api-zod/                    ← Zod validation schemas (Orval-generated)
│   │   └── src/generated/api.ts
│   ├── db/                         ← Drizzle ORM + PostgreSQL
│   │   ├── drizzle.config.ts
│   │   └── src/
│   │       ├── index.ts            ← Exports db client + all tables
│   │       └── schema/
│   │           ├── users.ts        ← user_profiles table
│   │           ├── plans.ts        ← plans table
│   │           ├── logs.ts         ← daily_logs table
│   │           ├── conversations.ts← conversations table
│   │           ├── messages.ts     ← messages table (cascade on conversation)
│   │           └── documents.ts    ← medical_documents table
│   ├── integrations-openai-ai-server/ ← Low-level OpenAI utilities (image, audio)
│   └── integrations-openai-ai-react/  ← OpenAI React hooks
│
├── scripts/                        ← Utility scripts
├── pnpm-workspace.yaml             ← Workspace package definitions
├── package.json                    ← Root scripts (typecheck, build)
├── .env.example                    ← Environment variable template ← READ THIS
└── README.md                       ← This file
```

---

## 🗄️ Database Schema

All tables use PostgreSQL via Drizzle ORM. Schema lives in `lib/db/src/schema/`.

| Table | Key Columns |
|---|---|
| `user_profiles` | `clerkUserId`, `name`, `age`, `gender`, `bloodGroup`, `weight`, `height`, `medicalConditions`, `medications`, `allergies`, `sleepHours`, `activityLevel`, `goals`, `location`, `additionalDetails` (JSON) |
| `plans` | `clerkUserId`, `title`, `type`, `description`, `status` |
| `daily_logs` | `clerkUserId`, `planId`, `logDate`, `mood`, `sleepHours`, `waterIntake`, `foodLog`, `symptomsLog`, `medicationTaken`, `notes`, `isCompleted` |
| `conversations` | `clerkUserId`, `mode` (`checkup`/`planner`/`education`), `title` |
| `messages` | `conversationId` (→ conversations, cascade), `role` (`user`/`assistant`), `content` |
| `medical_documents` | `clerkUserId`, `filename`, `mimeType`, `extractedData`, `summary`, `belongsToUser`, `documentDate` |

---

## 🔌 API Endpoints

Base URL: `/api`

| Method | Path | Description |
|---|---|---|
| `GET` | `/healthz` | Health check |
| `GET` | `/users/profile` | Get authenticated user's profile |
| `POST` | `/users/profile` | Create or update profile (upsert) |
| `GET` | `/plans` | List user's health plans |
| `POST` | `/plans` | Create a new plan |
| `GET` | `/plans/:id` | Get a single plan |
| `PATCH` | `/plans/:id` | Update a plan |
| `DELETE` | `/plans/:id` | Delete a plan |
| `GET` | `/logs` | 7-day log history |
| `GET` | `/logs/today` | Today's log entry |
| `POST` | `/logs` | Create/update a log entry |
| `GET` | `/chat/conversations` | List user's AI conversations |
| `POST` | `/chat/conversations` | Start a new conversation |
| `GET` | `/chat/conversations/:id/messages` | Message history (ownership verified) |
| `POST` | `/chat/conversations/:id/messages` | Send message → SSE streaming response (planner/checkup legacy) |
| `DELETE` | `/chat/conversations/:id` | Delete conversation + messages (cascade) |
| `GET` | `/documents` | List medical documents |
| `POST` | `/documents` | Upload a medical document |
| `POST` | `/checkup-agent/conversations/:id/message` | Health checkup — Agent 2 assessment + parallel Agent 4/5/3 orchestration |
| `GET` | `/checkup-agent/conversations/:id/assessment` | Fetch stored assessment JSON for a conversation |
| `POST` | `/education-agent/conversations/:id/message` | Education chat — Agent 5 (NutriWise) with Gemini fallback |
| `GET` | `/tasks` | List user tasks |
| `POST` | `/tasks` | Create task manually |
| `PATCH` | `/tasks/:id/complete` | Mark task complete |
| `DELETE` | `/tasks/:id` | Delete task |
| `POST` | `/tasks/agent-refresh` | Invoke Agent 3 to refresh task plan |
| `GET` | `/companion/messages` | Full companion conversation history |
| `GET` | `/companion/latest` | Latest companion message (for widget) |
| `POST` | `/companion/message` | Send to Agent 3, get reply + optional tasks |
| `POST` | `/companion/proactive` | Generate proactive check-in (4hr cache) |

---

## ⚡ AI Architecture

VitalGuide uses **two distinct AI patterns** depending on the feature:

### 1. SSE Streaming (Planner chat)
```
Frontend (ChatInterface.tsx)
  │
  ├─ POST /api/chat/conversations/:id/messages
  │
Backend (chat.ts)
  ├─ Verify ownership → load profile + docs → build system prompt
  ├─ Call Gemini 2.5 Flash (generateContentStream)
  └─ Stream SSE chunks → data: {"content":"..."} … data: [DONE]

Frontend reads stream with fetch + ReadableStream → real-time chat bubble
```

### 2. Agent Kickoff + Poll (Checkup & Education)
```
Frontend sends POST → backend kicks off CrewAI agent → polls until SUCCESS
→ returns structured JSON (no streaming)

Health Checkup (/api/checkup-agent):
  Agent 2  →  follow-up question OR assessment complete
                    ↓ (on complete, parallel)
  Agent 4  →  emergency first aid (if severity=emergency)
  Agent 5  →  nutrition advice (if food recs present)
  Agent 3  →  care plan + tasks

Education (/api/education-agent):
  Agent 5 (NutriWise)  →  evidence-based health education
       ↓ (on timeout/failure)
  Gemini 2.5 Flash fallback
```

**AI modes:**
- `planner` — SSE via Gemini 2.5 Flash. Health coaching, shame-free, references logs.
- `checkup` — Agent 2 conversational assessment + parallel Agent 4/5/3 orchestration.
- `education` — Agent 5 (NutriWise) with Gemini fallback. All 6 topics. History persists.

---

## 🔐 Authentication

Auth is handled by [Clerk](https://clerk.com).

- **Frontend**: `ClerkProvider` wraps the app. Routes protected with `<Show when="signed-in">`.
- **Backend**: `clerkMiddleware` from `@clerk/express` populates `req.auth` on every request.
- **Proxy**: In production, Clerk requests are proxied through `/api/__clerk` to avoid third-party cookie issues on Replit's shared domain.
- **Cache invalidation**: `ClerkQueryClientCacheInvalidator` clears TanStack Query cache on user switch.

---

## 🛠️ Development

### Prerequisites

- Node.js 20+
- pnpm 10+
- A Replit project (PostgreSQL database is provisioned automatically)

### Setup

```bash
# Install all workspace dependencies
pnpm install

# Push database schema to development database
pnpm --filter @workspace/db run push

# Start the API server (port 8080)
pnpm --filter @workspace/api-server run dev

# Start the frontend (port 5000)
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/vitalguide run dev
```

### Other useful commands

```bash
# Full typecheck across all packages
pnpm run typecheck

# Build everything
pnpm run build

# Regenerate API hooks and Zod schemas from openapi.yaml
pnpm --filter @workspace/api-spec run codegen
```

---

## 🔑 Environment Variables

On Replit, all sensitive values (API keys, tokens, secrets) live in the **Secrets** panel — never in a `.env` file. The `.env` file in this repo is git-ignored and should only hold non-sensitive local overrides (e.g. `PORT`, `NODE_ENV`).

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ Auto (Replit) | PostgreSQL connection string — injected automatically by Replit |
| `CLERK_PUBLISHABLE_KEY` | ✅ Secret | Clerk publishable key (`pk_...`) |
| `CLERK_SECRET_KEY` | ✅ Secret | Clerk secret key (`sk_...`) |
| `GEMINI_API_KEY` | ✅ Secret | Google Gemini API key — powers all AI chat features (Gemini 2.5 Flash) |
| `OPENAI_API_KEY` | ⚠️ Optional Secret | OpenAI key — used for document extraction and media utilities |
| `SESSION_SECRET` | ✅ Secret (Auto on Replit) | Random secret string for session signing |
| `PORT` | ✅ | Port for each server (8080 for API, 5000 for frontend) |
| `BASE_PATH` | ✅ | URL base path — use `/` for local dev |
| `NODE_ENV` | Auto | `development` or `production` |

---

## 🏛️ Architecture Decisions

- **Contract-first API**: `lib/api-spec/openapi.yaml` is the single source of truth. Run `codegen` after any route change to regenerate TanStack Query hooks and Zod schemas.
- **SSE streaming for planner only**: Real-time token streaming via SSE is used exclusively for the planner chat (`/api/chat/…`). Checkup and education use the agent kickoff+poll pattern which returns a single JSON response — do not attempt to add SSE to these routes.
- **Agent calls are backend-only**: CrewAI agents are never called from the frontend. All agent invocations go through `artifacts/api-server/src/lib/agentRouter.ts` → `invokeAgent(key, inputs, timeoutMs)`.
- **Agent timeouts + graceful fallback**: Every `invokeAgent` call is wrapped in try/catch. Checkup falls back to a canned message; education falls back to Gemini 2.5 Flash. The frontend must never crash if an agent is unavailable.
- **Clerk whitelabel proxy**: Required so Clerk auth tokens work across Replit's proxied iframe. Active in production only.
- **Cascade deletes**: `messages.conversationId` has `onDelete: "cascade"` — deleting a conversation automatically removes all its messages.
- **All React Query hooks require explicit `queryKey`**: Generated hooks enforce this via types. Example: `useGetProfile({ query: { queryKey: getGetProfileQueryKey() } })`.
- **Tailwind CSS layer ordering**: `@layer theme, base, clerk, components, utilities` must appear before `@import "tailwindcss"` in `index.css` — Clerk themes need the layer declared first.
- **Education mode guard**: `POST /api/education-agent/conversations/:id/message` rejects conversations where `mode !== "education"` with a 400. Always verify mode on agent-specific routes.
