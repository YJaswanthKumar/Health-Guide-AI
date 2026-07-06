# Phase 2 — MongoDB Schema Design

> **Status: PENDING APPROVAL — Do not implement until approved.**
> This document describes the proposed MongoDB schema for migrating VitalGuide from PostgreSQL/Drizzle.
> Every design decision is explained. Review, request changes, and approve before any code is written.

---

## Design Principles

| Principle | Rationale |
|---|---|
| **Embed what you always read together** | Messages inside a conversation, tasks inside a plan — avoids joins |
| **Reference what has unbounded growth** | Long chat histories use a separate `messages` collection |
| **One document per user-day for logs** | Daily health logs are small + date-keyed → embed all fields |
| **Clerk `userId` is the canonical user key** | Every document carries `clerkUserId: string` as the owner |
| **ISO-8601 strings for dates, UTC** | Consistent across all drivers and timezones |
| **`_id: ObjectId` everywhere** | Use `_id.toString()` as the public ID; no numeric auto-increment |
| **`createdAt` / `updatedAt` on every document** | Managed by the application layer on insert/update |

---

## Collection Index

1. [users](#1-users)
2. [conversations](#2-conversations)
3. [messages](#3-messages)
4. [plans](#4-plans)
5. [tasks](#5-tasks)
6. [daily_logs](#6-daily_logs)
7. [companion_messages](#7-companion_messages)
8. [medical_documents](#8-medical_documents)

---

## 1. `users`

One document per registered Clerk user. All profile fields are top-level for easy projection and updates.

```json
{
  "_id": "ObjectId",
  "clerkUserId": "user_2abc...",

  // Personal
  "name": "Jane Doe",
  "email": "jane@example.com",
  "dateOfBirth": "1990-04-15",
  "gender": "female",                // "male" | "female" | "other" | "prefer_not_to_say"
  "profileImageUrl": "https://...",

  // Biometrics
  "height": 165,                     // cm
  "weight": 58.5,                    // kg
  "bloodGroup": "O+",                // "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-" | null

  // Health history
  "medicalConditions": ["Diabetes (Type 2)", "Hypertension"],
  "medications": ["Metformin 500mg", "Amlodipine 5mg"],
  "allergies": ["Penicillin"],
  "surgicalHistory": ["Appendectomy 2015"],
  "familyHistory": ["Heart Disease (father)", "Diabetes (mother)"],

  // Lifestyle
  "activityLevel": "moderately_active", // "sedentary" | "lightly_active" | "moderately_active" | "very_active" | "extremely_active"
  "dietaryPreferences": ["vegetarian", "low_sugar"],
  "smokingStatus": "never",           // "never" | "former" | "current"
  "alcoholConsumption": "occasional", // "none" | "occasional" | "moderate" | "heavy"
  "sleepGoalHours": 8,

  // Goals
  "goals": "Manage blood sugar, lose 5kg in 3 months, improve cardio fitness",
  "primaryHealthGoal": "weight_loss", // "weight_loss" | "muscle_gain" | "disease_management" | "stress_reduction" | "general_wellness"

  // Onboarding
  "onboardingCompleted": true,
  "onboardingStep": 3,               // 1 | 2 | 3

  // Preferences
  "preferredLanguage": "en",
  "timezone": "America/New_York",
  "notificationsEnabled": true,

  // Metadata
  "createdAt": "2026-07-06T10:00:00Z",
  "updatedAt": "2026-07-06T12:30:00Z"
}
```

### Indexes
```js
{ clerkUserId: 1 }          // unique — primary lookup key
{ email: 1 }                // unique — for email-based lookups
```

---

## 2. `conversations`

One document per chat session. Short metadata only — messages live in the `messages` collection.

```json
{
  "_id": "ObjectId",
  "clerkUserId": "user_2abc...",

  "mode": "checkup",                 // "checkup" | "education" | "planner" | "companion"
  "title": "Headache Assessment",
  "summary": null,                   // AI-generated summary, populated after session ends

  // Emergency flag (checkup mode only)
  "emergencyDetected": false,
  "emergencyLevel": null,            // null | "mild" | "moderate" | "critical"
  "emergencyKeywords": [],           // ["chest pain", "shortness of breath"]

  // Linked entities
  "linkedPlanId": null,              // ObjectId ref to plans — set when planner mode creates/tracks a plan
  "linkedDocumentIds": [],           // ObjectId[] refs to medical_documents used in this conversation

  // Agent metadata
  "agentVersion": null,              // "agent1" | "agent2" | null — which CrewAI agent handled this, if any
  "agentKickoffId": null,            // CrewAI kickoff_id for traceability

  "messageCount": 4,                 // denormalized count — updated on each message insert
  "lastMessageAt": "2026-07-06T11:45:00Z",

  "createdAt": "2026-07-06T11:30:00Z",
  "updatedAt": "2026-07-06T11:45:00Z"
}
```

### Indexes
```js
{ clerkUserId: 1, mode: 1, createdAt: -1 }   // list conversations by user+mode, newest first
{ clerkUserId: 1, lastMessageAt: -1 }         // dashboard recent activity
{ linkedPlanId: 1 }                           // find conversations attached to a plan
```

---

## 3. `messages`

One document per chat turn. Kept separate from conversations because sessions can grow to hundreds of messages. Each message belongs to exactly one conversation.

```json
{
  "_id": "ObjectId",
  "conversationId": "ObjectId",      // ref to conversations._id
  "clerkUserId": "user_2abc...",     // denormalized for auth checks without a join

  "role": "user",                    // "user" | "assistant" | "system"
  "content": "I have a sharp pain in my left temple...",

  // Rich content (assistant only)
  "contentType": "text",             // "text" | "markdown" | "structured"
  "structuredData": null,            // { type: "symptom_summary", data: {...} } — agent-produced structured output

  // Streaming metadata
  "isComplete": true,                // false while streaming, true when done
  "tokenCount": 82,                  // approximate token count for billing/analytics

  // Emergency signal (assistant messages in checkup mode)
  "emergencyFlag": false,
  "emergencyLevel": null,            // null | "mild" | "moderate" | "critical"
  "recommendedAction": null,         // "call_911" | "visit_er" | "see_doctor" | "monitor" | null

  // Source tracing
  "sourceAgent": null,               // "agent1" | "agent2" | "gemini" | null
  "modelId": "gemini-2.5-flash",     // which AI model generated this

  "createdAt": "2026-07-06T11:31:00Z"
}
```

### Indexes
```js
{ conversationId: 1, createdAt: 1 }     // fetch all messages in a conversation in order
{ clerkUserId: 1, createdAt: -1 }       // user message history feed
{ conversationId: 1, role: 1 }          // filter by role within a conversation
```

---

## 4. `plans`

Health and care plans created manually or by Agent 3. Tasks can be embedded for small plans or stored in `tasks` for large/recurring ones.

```json
{
  "_id": "ObjectId",
  "clerkUserId": "user_2abc...",

  "title": "30-Day Diabetes Management Plan",
  "description": "Structured plan targeting blood sugar stabilization through diet, medication adherence, and daily walks.",
  "category": "medication",          // "medication" | "diet" | "fitness" | "recovery" | "mental_health" | "custom"
  "type": "treatment",               // "treatment" | "prevention" | "maintenance" | "rehabilitation"
  "status": "active",                // "active" | "paused" | "completed" | "cancelled"

  // Timeline
  "startDate": "2026-07-01",
  "endDate": "2026-07-31",
  "durationDays": 30,
  "currentDay": 6,
  "completedDays": 5,
  "remainingDays": 25,
  "progressPercentage": 17,

  // Agent-sourced plans carry the agent's original output for reference
  "sourceAgent": "agent3",           // "agent3" | "user" | null
  "agentOutput": null,               // raw agent JSON output, stored for debugging/replay

  // Linked conversation where this plan was created
  "linkedConversationId": null,

  // Embedded task templates (the plan's defined activities — NOT daily tracking)
  "taskTemplates": [
    {
      "title": "Take Metformin 500mg",
      "category": "medication",
      "priority": "high",
      "recurrence": "daily",
      "dueTime": "08:00"
    },
    {
      "title": "30-minute morning walk",
      "category": "exercise",
      "priority": "medium",
      "recurrence": "daily",
      "dueTime": "07:00"
    }
  ],

  // Daily compliance tracking (one entry per day the plan was active)
  "dailyCompliance": [
    {
      "date": "2026-07-01",
      "completedTaskCount": 2,
      "totalTaskCount": 2,
      "complianceRate": 100,
      "notes": null
    }
  ],

  "notes": null,
  "createdAt": "2026-07-01T08:00:00Z",
  "updatedAt": "2026-07-06T09:15:00Z"
}
```

### Indexes
```js
{ clerkUserId: 1, status: 1, createdAt: -1 }   // list active/all plans
{ clerkUserId: 1, category: 1 }                 // filter by plan category
{ linkedConversationId: 1 }                     // find plan from a conversation
```

---

## 5. `tasks`

Individual actionable health tasks. Can be standalone (user-created) or linked to a plan.

```json
{
  "_id": "ObjectId",
  "clerkUserId": "user_2abc...",

  "title": "Drink 8 glasses of water",
  "description": "Track water intake throughout the day. Use the hydration tracker in the log.",
  "category": "hydration",           // "medication" | "hydration" | "exercise" | "nutrition" | "sleep" | "mental_health" | "general"
  "priority": "medium",              // "low" | "medium" | "high" | "critical"

  // Scheduling
  "dueDate": "2026-07-06",
  "dueTime": "20:00",
  "recurrence": "daily",             // null | "daily" | "weekdays" | "weekends" | "weekly" | "monthly"
  "recurrenceEndDate": null,

  // Status
  "status": "pending",               // "pending" | "in_progress" | "completed" | "skipped" | "cancelled"
  "completed": false,
  "completedAt": null,

  // Source
  "sourceAgent": "agent3",           // "agent3" | "user" | "plan" | null
  "linkedPlanId": null,              // ObjectId ref to plans._id if this task was generated by a plan

  // Tracking
  "skippedReason": null,
  "completionNote": null,

  "createdAt": "2026-07-06T00:00:00Z",
  "updatedAt": "2026-07-06T10:30:00Z"
}
```

### Indexes
```js
{ clerkUserId: 1, status: 1, dueDate: 1 }      // today's pending tasks
{ clerkUserId: 1, createdAt: -1 }               // full task history
{ linkedPlanId: 1 }                             // tasks belonging to a plan
{ clerkUserId: 1, recurrence: 1, status: 1 }    // recurring task management
```

---

## 6. `daily_logs`

One document per user per calendar day. All health metrics for a given day are embedded in a single document — avoids scatter and makes daily summaries trivial.

```json
{
  "_id": "ObjectId",
  "clerkUserId": "user_2abc...",
  "logDate": "2026-07-06",           // YYYY-MM-DD — unique per user per day

  // Mood & Energy
  "mood": "good",                    // "terrible" | "bad" | "okay" | "good" | "great" | null
  "moodScore": 4,                    // 1-5 mapped from mood
  "energyLevel": "moderate",         // "very_low" | "low" | "moderate" | "high" | "very_high" | null

  // Sleep
  "sleep": {
    "hoursSlept": 7.5,
    "quality": "good",               // "poor" | "fair" | "good" | "excellent" | null
    "bedtime": "23:00",
    "wakeTime": "06:30",
    "wakeCount": 1
  },

  // Hydration
  "waterGlasses": 6,
  "waterMl": null,                   // alternative: track in mL if user prefers

  // Nutrition
  "meals": {
    "breakfast": {
      "eaten": true,
      "description": "Oats with banana",
      "calories": 320,
      "notes": null
    },
    "lunch": {
      "eaten": true,
      "description": "Grilled chicken salad",
      "calories": 450,
      "notes": null
    },
    "dinner": {
      "eaten": true,
      "description": "Dal and rice",
      "calories": 500,
      "notes": null
    },
    "snacks": [
      { "description": "Apple", "calories": 80, "time": "16:00" }
    ]
  },
  "totalCalories": 1350,
  "junkFoodServings": 0,
  "junkFoodItems": [],

  // Physical activity
  "exercise": {
    "completed": true,
    "type": "walking",
    "durationMinutes": 35,
    "steps": 4800,
    "caloriesBurned": 180,
    "intensity": "moderate"          // "light" | "moderate" | "vigorous"
  },

  // Symptoms
  "symptoms": [
    {
      "name": "headache",
      "severity": "mild",            // "mild" | "moderate" | "severe"
      "duration": "2 hours",
      "notes": "Went away after drinking water"
    }
  ],
  "overallHealthRating": 4,          // 1-5

  // Vitals (optional, user-entered or device-synced)
  "vitals": {
    "bloodPressure": { "systolic": 118, "diastolic": 76, "measuredAt": "08:15" },
    "heartRate": 72,
    "bloodSugar": { "value": 98, "unit": "mg/dL", "measuredAt": "07:30", "type": "fasting" },
    "weight": 58.2,
    "temperature": null,
    "oxygenSaturation": null
  },

  // Medications taken
  "medicationsTaken": [
    { "name": "Metformin 500mg", "taken": true, "time": "08:05", "notes": null }
  ],
  "medicationAdherence": true,       // all scheduled meds taken

  // Custom sections (user-defined or agent-defined extensions)
  "customSections": [
    {
      "key": "pain_tracker",
      "label": "Pain Tracker",
      "data": { "location": "lower back", "scale": 3, "notes": "Worse in morning" }
    }
  ],

  // Completion
  "isCompleted": false,              // user marked the day's log as complete
  "completedAt": null,

  // AI-generated daily summary (populated after log completion or on-demand)
  "aiSummary": null,
  "aiInsights": [],

  "createdAt": "2026-07-06T07:00:00Z",
  "updatedAt": "2026-07-06T21:45:00Z"
}
```

### Indexes
```js
{ clerkUserId: 1, logDate: -1 }               // unique — primary lookup; daily log history
{ clerkUserId: 1, isCompleted: 1, logDate: -1 } // incomplete logs for reminders
{ clerkUserId: 1, "vitals.bloodSugar.value": 1 } // blood sugar trend queries
```
**Unique constraint:** `{ clerkUserId: 1, logDate: 1 }` (one log per user per day)

---

## 7. `companion_messages`

Chat history for the Care Companion (Agent 3 / fallback Gemini). Kept separate from `messages` because companion is a distinct always-on mode with its own UI.

```json
{
  "_id": "ObjectId",
  "clerkUserId": "user_2abc...",

  "role": "assistant",               // "user" | "assistant"
  "content": "Good morning! How are you feeling today? I noticed you slept well last night.",

  // Agent tracing
  "sourceAgent": "gemini",           // "agent3" | "gemini" | "fallback" | null
  "agentOutput": null,               // full agent3 output JSON if agent3 was used

  // Actions taken as a result of this message
  "actionsApplied": [
    { "action": "CREATE_TASK", "taskId": "ObjectId" }
  ],

  "createdAt": "2026-07-06T08:00:00Z"
}
```

### Indexes
```js
{ clerkUserId: 1, createdAt: -1 }       // fetch latest companion message (dashboard widget)
{ clerkUserId: 1, role: 1, createdAt: -1 } // last assistant message for proactive check
```

---

## 8. `medical_documents`

Uploaded medical documents (images/PDFs). Stores extracted structured data and links back to the conversation where they were analyzed.

```json
{
  "_id": "ObjectId",
  "clerkUserId": "user_2abc...",

  // Storage
  "filename": "bloodwork_june2026.jpg",
  "originalFilename": "bloodwork_june2026.jpg",
  "mimeType": "image/jpeg",
  "fileSize": 248320,                // bytes
  "storageUrl": "https://...",       // Replit Object Storage URL or S3
  "thumbnailUrl": null,

  // Classification
  "isRelevantMedicalDoc": true,
  "documentType": "lab_report",      // "lab_report" | "prescription" | "discharge_summary" | "imaging" | "insurance" | "other" | null

  // AI Extraction (Gemini Vision)
  "summary": "Comprehensive metabolic panel showing elevated glucose (112 mg/dL) and normal kidney function.",
  "extractedData": {
    "patientName": "Jane Doe",
    "reportDate": "2026-06-20",
    "doctorName": "Dr. Patel",
    "hospitalName": "City General Hospital",
    "diagnoses": ["Pre-diabetes"],
    "medications": ["Metformin 500mg"],
    "allergies": [],
    "chiefComplaints": ["Fatigue", "Increased thirst"],
    "bloodGroup": null,
    "testResults": {
      "glucose_fasting": "112 mg/dL",
      "HbA1c": "6.1%",
      "creatinine": "0.9 mg/dL",
      "egfr": ">60"
    }
  },

  // Profile update triggered by this document
  "profileUpdated": true,
  "profileUpdateReason": "Blood group and diagnosis data extracted and merged into profile",
  "profileChanges": ["medicalConditions: added Pre-diabetes", "medications: added Metformin 500mg"],

  // Conversation this doc was uploaded in and analyzed
  "linkedConversationId": "ObjectId",

  "uploadedAt": "2026-07-06T11:00:00Z",
  "createdAt": "2026-07-06T11:00:00Z",
  "updatedAt": "2026-07-06T11:05:00Z"
}
```

### Indexes
```js
{ clerkUserId: 1, uploadedAt: -1 }          // user's document history
{ clerkUserId: 1, documentType: 1 }         // filter by type
{ linkedConversationId: 1 }                 // docs used in a specific conversation
```

---

## Embedding vs. Reference Summary

| Relationship | Strategy | Why |
|---|---|---|
| Conversation → Messages | **Reference** (separate `messages` collection) | Unbounded growth; can reach 200+ messages per session |
| Plan → Task Templates | **Embed** in `plans.taskTemplates` | Small, finite, always read together with plan |
| Plan → Daily Compliance | **Embed** in `plans.dailyCompliance` | Max 365 entries/year; always read with plan |
| Log → All health fields | **Embed** in single `daily_logs` doc | Always read together; max ~30 fields per day |
| Companion Message → Actions | **Embed** `actionsApplied` | Small array; context needed for companion UI |
| Document → Extracted Data | **Embed** in `medical_documents.extractedData` | Single document; always read together |

---

## Migration Path from PostgreSQL

| PostgreSQL Table | MongoDB Collection | Notes |
|---|---|---|
| `user_profiles` | `users` | Add new optional fields; `clerkUserId` stays as primary key |
| `conversations` | `conversations` | Add `linkedPlanId`, `emergencyDetected`, `agentVersion` fields |
| `messages` | `messages` | Add `structuredData`, `emergencyFlag`, `modelId` fields |
| `plans` | `plans` | Add `taskTemplates`, `dailyCompliance`, `type` fields |
| `tasks` | `tasks` | Add `dueDate`, `recurrenceEndDate`, `skippedReason` fields |
| `daily_logs` | `daily_logs` | Restructure `meals` as nested object; add `vitals`, `exercise` objects |
| `companion_messages` | `companion_messages` | Add `sourceAgent`, `actionsApplied`, `agentOutput` fields |
| `medical_documents` | `medical_documents` | Add `documentType`, `thumbnailUrl`, `storageUrl` fields |

---

## What Changes in Phase 3+ (API Layer)

When approved and implemented, the following will change:

- **ORM**: Drizzle removed, replaced with the official MongoDB Node.js driver (or Mongoose for schema validation)
- **DB package** (`lib/db`): New schema files using Mongoose models or plain JS type defs
- **All routes**: Swap `db.select/insert/update/delete` for `collection.findOne/insertOne/updateOne/deleteOne`
- **IDs**: Numeric auto-increment IDs → `ObjectId` strings; all API responses switch from `id: number` to `id: string`
- **Dates**: Drizzle `timestamp` → ISO-8601 strings stored as `Date` objects in MongoDB
- **OpenAPI spec**: Update all `id` types from `integer` to `string`; regenerate Orval hooks

---

*Generated: 2026-07-06 | Awaiting approval before any implementation begins.*
