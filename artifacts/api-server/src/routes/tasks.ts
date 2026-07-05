import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, tasksTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  invokeAgent,
  buildCarePlannerInput,
  type AgentCarePlannerOutput,
  type AgentTaskOutput,
} from "../lib/agentRouter";

const router = Router();

router.get("/", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const tasks = await db
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.clerkUserId, userId))
      .orderBy(desc(tasksTable.createdAt));
    return res.json(tasks);
  } catch (err) {
    logger.error({ err }, "Failed to list tasks");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const { title, description, category, priority, dueTime, recurrence } = req.body;
  if (!title) return res.status(400).json({ error: "title is required" });
  try {
    const [task] = await db
      .insert(tasksTable)
      .values({
        clerkUserId: userId,
        title,
        description: description ?? null,
        category: category ?? "general",
        priority: priority ?? "medium",
        dueTime: dueTime ?? null,
        recurrence: recurrence ?? null,
        sourceAgent: "user",
      })
      .returning();
    return res.status(201).json(task);
  } catch (err) {
    logger.error({ err }, "Failed to create task");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const { title, description, category, priority, dueTime, recurrence, status } = req.body;
  try {
    const [updated] = await db
      .update(tasksTable)
      .set({
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(category !== undefined && { category }),
        ...(priority !== undefined && { priority }),
        ...(dueTime !== undefined && { dueTime }),
        ...(recurrence !== undefined && { recurrence }),
        ...(status !== undefined && { status }),
      })
      .where(and(eq(tasksTable.id, id), eq(tasksTable.clerkUserId, userId)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Task not found" });
    return res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to update task");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:id/complete", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const [updated] = await db
      .update(tasksTable)
      .set({ completed: true, status: "completed" })
      .where(and(eq(tasksTable.id, id), eq(tasksTable.clerkUserId, userId)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Task not found" });
    return res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to complete task");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const deleted = await db
      .delete(tasksTable)
      .where(and(eq(tasksTable.id, id), eq(tasksTable.clerkUserId, userId)))
      .returning({ id: tasksTable.id });
    if (!deleted.length) return res.status(404).json({ error: "Task not found" });
    return res.status(204).send();
  } catch (err) {
    logger.error({ err }, "Failed to delete task");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/agent-refresh", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { userProfilesTable, dailyLogsTable } = await import("@workspace/db");
    const profiles = await db.select().from(userProfilesTable).where(eq(userProfilesTable.clerkUserId, userId));
    const profile = profiles[0];
    if (!profile) return res.status(404).json({ error: "Profile not found" });

    const currentTasks = await db.select().from(tasksTable).where(eq(tasksTable.clerkUserId, userId));
    const recentLogs = await db
      .select()
      .from(dailyLogsTable)
      .where(eq(dailyLogsTable.clerkUserId, userId))
      .orderBy(desc(dailyLogsTable.date))
      .limit(7);

    const input = buildCarePlannerInput({
      userProfile: { ...profile },
      currentTasks,
      dailyLogs: recentLogs,
      medicalConditions: profile.medicalConditions ? [profile.medicalConditions] : [],
      currentMedications: profile.medications ? [profile.medications] : [],
    });

    const output = await invokeAgent("agent3", input, 90000) as AgentCarePlannerOutput;

    const actions = output?.backend_actions ?? [];
    const todayTasks: AgentTaskOutput[] = output?.today_tasks ?? [];

    const createdTasks = [];
    for (const task of todayTasks) {
      const [created] = await db
        .insert(tasksTable)
        .values({
          clerkUserId: userId,
          title: task.title,
          description: task.description ?? null,
          category: task.category ?? "general",
          priority: task.priority ?? "medium",
          dueTime: task.due_time ?? null,
          recurrence: task.recurrence ?? null,
          sourceAgent: "agent3",
        })
        .returning();
      createdTasks.push(created);
    }

    for (const action of actions) {
      if (action.action === "CREATE_TASK" && action.task) {
        const t = action.task;
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
      } else if (action.action === "COMPLETE_TASK" && action.task_id) {
        const taskId = Number(action.task_id);
        if (!isNaN(taskId)) {
          await db
            .update(tasksTable)
            .set({ completed: true, status: "completed" })
            .where(and(eq(tasksTable.id, taskId), eq(tasksTable.clerkUserId, userId)));
        }
      } else if (action.action === "DELETE_TASK" && action.task_id) {
        const taskId = Number(action.task_id);
        if (!isNaN(taskId)) {
          await db.delete(tasksTable).where(and(eq(tasksTable.id, taskId), eq(tasksTable.clerkUserId, userId)));
        }
      }
    }

    const updatedTasks = await db
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.clerkUserId, userId))
      .orderBy(desc(tasksTable.createdAt));

    return res.json({ tasks: updatedTasks, agentOutput: output });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Agent call failed";
    logger.error({ err }, "Agent task refresh failed");
    return res.status(500).json({ error: message });
  }
});

export default router;
