# VitalGuide 🩺

> Your trusted AI-powered health companion — understand symptoms, track care plans, and learn about nutrition and wellness.

VitalGuide is a full-stack, personalized health management app powered by Google Gemini 2.5 Flash. Users complete a health profile on onboarding, which is injected into every AI conversation for truly personalized responses.

---

## ✨ Features

| Feature | Description |
|---|---|
| **Health Checkup** | Conversational symptom assessment. Asks follow-up questions, gives safe preliminary guidance, detects emergencies and shows alert banners. |
| **Plan Tracker** | Manage medication, diet, and fitness plans. AI coach helps you stay on track with encouraging, shame-free guidance. |
| **Health Education** | Evidence-based myth-busting and nutrition Q&A. Personalized to your profile. |
| **Daily Logs** | Track mood, sleep, water intake, food, symptoms, and medications each day. |
| **Onboarding Profile** | 3-step profile setup (personal info → health conditions → goals) feeds every AI prompt. |
| **Medical Documents** | Upload and store medical records; summaries are injected into Checkup AI context. |

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
│   │   │       └── documents.ts    ← Medical documents /api/documents
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
| `POST` | `/chat/conversations/:id/messages` | Send message → SSE streaming response |
| `DELETE` | `/chat/conversations/:id` | Delete conversation + messages (cascade) |
| `GET` | `/documents` | List medical documents |
| `POST` | `/documents` | Upload a medical document |

---

## ⚡ AI Chat Architecture

```
Frontend (ChatInterface.tsx)
  │
  ├─ POST /api/chat/conversations/:id/messages
  │
Backend (chat.ts)
  ├─ Verify conversation ownership
  ├─ Load user health profile from DB
  ├─ Load recent medical documents (checkup mode only)
  ├─ Build system prompt:
  │     [mode prompt] + [health profile] + [document summaries]
  ├─ Call Google Gemini 2.5 Flash (generateContentStream)
  │
  └─ Stream SSE chunks:
        data: {"content": "..."}   ← per token
        data: [DONE]               ← end of stream
        data: {"error": "..."}     ← on failure

Frontend reads stream with fetch + ReadableStream → updates chat bubble in real-time
Full response is saved to messages table after stream completes
```

**AI modes and their system prompt focus:**
- `checkup` — Symptom assessment. Detects `EMERGENCY` keyword → shows alert banner.
- `planner` — Health coaching. References logged food/sleep/mood data.
- `education` — Myth-busting and nutrition Q&A.

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
- **SSE streaming**: AI responses stream token-by-token via Server-Sent Events — native `fetch` + `ReadableStream` on the frontend, `res.write()` on the backend. Not the generated mutation hook.
- **Clerk whitelabel proxy**: Required so Clerk auth tokens work across Replit's proxied iframe. Active in production only.
- **Cascade deletes**: `messages.conversationId` has `onDelete: "cascade"` — deleting a conversation automatically removes all its messages.
- **All React Query hooks require explicit `queryKey`**: Generated hooks enforce this via types. Example: `useGetProfile({ query: { queryKey: getGetProfileQueryKey() } })`.
- **Tailwind CSS layer ordering**: `@layer theme, base, clerk, components, utilities` must appear before `@import "tailwindcss"` in `index.css` — Clerk themes need the layer declared first.
