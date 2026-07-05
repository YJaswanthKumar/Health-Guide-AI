import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, companionMessagesTable, tasksTable, userProfilesTable, dailyLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { applyPlanActions } from "../lib/planActions";
import {
  invokeAgent,
  buildCarePlannerInput,
  type AgentCarePlannerOutput,
  type AgentTaskOutput,
} from "../lib/agentRouter";

const router = Router();

router.get("/messages", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const messages = await db
      .select()
      .from(companionMessagesTable)
      .where(eq(companionMessagesTable.clerkUserId, userId))
      .orderBy(companionMessagesTable.createdAt)
      .limit(100);
    return res.json(messages);
  } catch (err) {
    logger.error({ err }, "Failed to fetch companion messages");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/latest", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const [latest] = await db
      .select()
      .from(companionMessagesTable)
      .where(eq(companionMessagesTable.clerkUserId, userId))
      .orderBy(desc(companionMessagesTable.createdAt))
      .limit(1);
    return res.json(latest ?? null);
  } catch (err) {
    logger.error({ err }, "Failed to fetch latest companion message");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/message", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: "content is required" });

  try {
    const [userMsg] = await db
      .insert(companionMessagesTable)
      .values({ clerkUserId: userId, role: "user", content })
      .returning();

    const profiles = await db.select().from(userProfilesTable).where(eq(userProfilesTable.clerkUserId, userId));
    const profile = profiles[0];
    if (!profile) return res.status(404).json({ error: "Profile not found" });

    const currentTasks = await db.select().from(tasksTable).where(eq(tasksTable.clerkUserId, userId));
    const recentLogs = await db
      .select()
      .from(dailyLogsTable)
      .where(eq(dailyLogsTable.clerkUserId, userId))
      .orderBy(desc(dailyLogsTable.logDate))
      .limit(7);

    const history = await db
      .select()
      .from(companionMessagesTable)
      .where(eq(companionMessagesTable.clerkUserId, userId))
      .orderBy(companionMessagesTable.createdAt)
      .limit(20);

    const input = buildCarePlannerInput({
      userProfile: { ...profile },
      currentTasks,
      dailyLogs: recentLogs,
      medicalConditions: profile.medicalConditions ? [profile.medicalConditions] : [],
      currentMedications: profile.medications ? [profile.medications] : [],
      userMessage: content,
      conversationHistory: history.map(m => ({ role: m.role, content: m.content })),
    });

    let assistantContent = "I'm here to support your health journey. How can I help you today?";
    let agentOutput: AgentCarePlannerOutput | null = null;

    try {
      agentOutput = await invokeAgent("agent3", input, 90000) as AgentCarePlannerOutput;

      const companion = agentOutput?.dashboard_companion;
      assistantContent =
        companion?.message ??
        companion?.question ??
        companion?.greeting ??
        companion?.proactive_message ??
        assistantContent;

      const actions = agentOutput?.backend_actions ?? [];
      for (const action of actions) {
        if (action.action === "CREATE_TASK" && action.task) {
          const t: AgentTaskOutput = action.task;
          await db.insert(tasksTable).values({
            clerkUserId: userId,
            title: t.title,
            description: t.description ?? null,
            category: t.category ?? "general",
            priority: t.priority ?? "medium",
            dueTime: t.due_time ?? null,
            recurrence: t.recurrence ?? null,
            sourceAgent: "agent3",
          });
        }
      }
      await applyPlanActions(actions, userId);

      for (const task of agentOutput?.today_tasks ?? []) {
        await db.insert(tasksTable).values({
          clerkUserId: userId,
          title: task.title,
          description: task.description ?? null,
          category: task.category ?? "general",
          priority: task.priority ?? "medium",
          dueTime: task.due_time ?? null,
          sourceAgent: "agent3",
        });
      }
    } catch (agentErr) {
      logger.warn({ agentErr }, "Agent call failed, using fallback response");
      assistantContent = generateFallbackResponse(content, profile);
    }

    const [assistantMsg] = await db
      .insert(companionMessagesTable)
      .values({ clerkUserId: userId, role: "assistant", content: assistantContent })
      .returning();

    return res.json({ userMessage: userMsg, assistantMessage: assistantMsg, agentOutput });
  } catch (err) {
    logger.error({ err }, "Failed to process companion message");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/proactive", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const [latest] = await db
      .select()
      .from(companionMessagesTable)
      .where(eq(companionMessagesTable.clerkUserId, userId))
      .orderBy(desc(companionMessagesTable.createdAt))
      .limit(1);

    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
    if (latest && latest.role === "assistant" && latest.createdAt > fourHoursAgo) {
      return res.json({ message: latest, fresh: false });
    }

    const profiles = await db.select().from(userProfilesTable).where(eq(userProfilesTable.clerkUserId, userId));
    const profile = profiles[0];
    if (!profile) return res.status(404).json({ error: "Profile not found" });

    const currentTasks = await db.select().from(tasksTable).where(eq(tasksTable.clerkUserId, userId));
    const recentLogs = await db
      .select()
      .from(dailyLogsTable)
      .where(eq(dailyLogsTable.clerkUserId, userId))
      .orderBy(desc(dailyLogsTable.logDate))
      .limit(3);

    const input = buildCarePlannerInput({
      userProfile: { ...profile },
      currentTasks,
      dailyLogs: recentLogs,
      medicalConditions: profile.medicalConditions ? [profile.medicalConditions] : [],
      currentMedications: profile.medications ? [profile.medications] : [],
      userMessage: "Generate a proactive check-in message for the user based on their current health status.",
    });

    let content = `Good ${getTimeOfDay()}, ${profile.name}! I'm your personal care companion. How are you feeling today?`;

    try {
      const output = await invokeAgent("agent3", input, 90000) as AgentCarePlannerOutput;
      const companion = output?.dashboard_companion;
      content =
        companion?.message ??
        companion?.question ??
        companion?.greeting ??
        companion?.proactive_message ??
        content;

      const actions = output?.backend_actions ?? [];
      for (const action of actions) {
        if (action.action === "CREATE_TASK" && action.task) {
          const t: AgentTaskOutput = action.task;
          await db.insert(tasksTable).values({
            clerkUserId: userId,
            title: t.title,
            description: t.description ?? null,
            category: t.category ?? "general",
            priority: t.priority ?? "medium",
            dueTime: t.due_time ?? null,
            sourceAgent: "agent3",
          });
        }
      }
      await applyPlanActions(actions, userId);
    } catch (agentErr) {
      logger.warn({ agentErr }, "Agent proactive failed, using fallback");
    }

    const [msg] = await db
      .insert(companionMessagesTable)
      .values({ clerkUserId: userId, role: "assistant", content })
      .returning();

    return res.json({ message: msg, fresh: true });
  } catch (err) {
    logger.error({ err }, "Failed to generate proactive message");
    return res.status(500).json({ error: "Internal server error" });
  }
});

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

function generateFallbackResponse(userMessage: string, profile: { name: string; medicalConditions?: string | null }) {
  const lower = userMessage.toLowerCase();
  if (lower.includes("medicine") || lower.includes("medication")) {
    return `${profile.medicalConditions ? `With your condition in mind, it's` : "It's"} important to take medications consistently. Have you had a chance to check your schedule for today?`;
  }
  if (lower.includes("water") || lower.includes("hydrat")) {
    return "Staying hydrated is key to recovery and energy. Aim for at least 8 glasses today!";
  }
  if (lower.includes("exercise") || lower.includes("workout")) {
    return "Regular movement is great for your health. Even a short 15-minute walk can make a big difference!";
  }
  if (lower.includes("sleep")) {
    return "Quality sleep is when your body heals and recovers. Are you getting 7-9 hours each night?";
  }
  return `Thank you for sharing that, ${profile.name}. I'm here to support your health journey. Is there anything specific you'd like help with today?`;
}

export default router;
