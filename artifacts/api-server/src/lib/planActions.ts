import { db, plansTable, tasksTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import type { AgentCarePlannerOutput, AgentPlanOutput, AgentTaskOutput } from "./agentRouter";

function computeDurationDays(startDate?: string | null, endDate?: string | null): number | null {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (isNaN(start) || isNaN(end) || end < start) return null;
  return Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
}

// Derives any missing progress fields from the ones the agent (or our own
// computation) did supply, so the stored plan is always internally consistent
// even if Agent 3 only returns a subset of the extended schema.
function deriveProgressFields(p: Partial<AgentPlanOutput>, durationDays: number | null) {
  let completedDays = p.completed_days ?? null;
  let remainingDays = p.remaining_days ?? null;
  let progressPercentage = p.progress_percentage ?? null;
  let currentDay = p.current_day ?? null;

  if (durationDays != null) {
    if (completedDays == null && currentDay != null) completedDays = Math.max(0, currentDay - 1);
    if (completedDays == null && remainingDays != null) completedDays = Math.max(0, durationDays - remainingDays);
    if (completedDays != null && remainingDays == null) remainingDays = Math.max(0, durationDays - completedDays);
    if (completedDays != null && progressPercentage == null) {
      progressPercentage = Math.max(0, Math.min(100, Math.round((completedDays / durationDays) * 100)));
    }
    if (currentDay == null && completedDays != null) currentDay = completedDays + 1;
  }

  return { completedDays, remainingDays, progressPercentage, currentDay };
}

async function createAssociatedTasks(tasks: AgentTaskOutput[] | undefined, userId: string, planId: number) {
  if (!tasks?.length) return;
  for (const t of tasks) {
    if (!t?.title) continue;
    await db.insert(tasksTable).values({
      clerkUserId: userId,
      planId,
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

type BackendAction = NonNullable<AgentCarePlannerOutput["backend_actions"]>[number];

export async function applyPlanActions(actions: BackendAction[], userId: string): Promise<void> {
  for (const action of actions) {
    try {
      if (action.action === "CREATE_PLAN" && action.plan) {
        const p = action.plan;
        const durationDays = p.duration_days ?? computeDurationDays(p.start_date, p.end_date);
        const { completedDays, remainingDays, progressPercentage, currentDay } = deriveProgressFields(p, durationDays);
        const [created] = await db.insert(plansTable).values({
          clerkUserId: userId,
          title: p.title,
          type: p.type ?? p.category ?? "custom",
          category: p.category ?? p.type ?? null,
          description: p.description ?? null,
          status: p.status ?? "active",
          startDate: p.start_date ?? null,
          endDate: p.end_date ?? null,
          durationDays,
          completedDays,
          remainingDays,
          progressPercentage,
          currentDay,
          sourceAgent: "agent3",
        }).returning();
        await createAssociatedTasks(p.tasks, userId, created.id);
      } else if (action.action === "UPDATE_PLAN" && action.plan_id) {
        const planId = Number(action.plan_id);
        if (isNaN(planId)) continue;
        const p: Partial<AgentPlanOutput> = action.plan ?? {};
        const [existing] = await db.select().from(plansTable).where(and(eq(plansTable.id, planId), eq(plansTable.clerkUserId, userId)));
        if (!existing) continue;
        const nextStart = p.start_date ?? existing.startDate;
        const nextEnd = p.end_date ?? existing.endDate;
        const durationDays = p.duration_days ?? computeDurationDays(nextStart, nextEnd) ?? existing.durationDays;
        const { completedDays, remainingDays, progressPercentage, currentDay } = deriveProgressFields(p, durationDays);
        const updates: Record<string, unknown> = { durationDays };
        if (p.title !== undefined) updates.title = p.title;
        if (p.type !== undefined) updates.type = p.type;
        if (p.category !== undefined) updates.category = p.category;
        if (p.description !== undefined) updates.description = p.description;
        if (p.status !== undefined) updates.status = p.status;
        if (p.start_date !== undefined) updates.startDate = p.start_date;
        if (p.end_date !== undefined) updates.endDate = p.end_date;
        if (completedDays != null) updates.completedDays = completedDays;
        if (remainingDays != null) updates.remainingDays = remainingDays;
        if (progressPercentage != null) updates.progressPercentage = progressPercentage;
        if (currentDay != null) updates.currentDay = currentDay;
        await db.update(plansTable).set(updates).where(and(eq(plansTable.id, planId), eq(plansTable.clerkUserId, userId)));
        await createAssociatedTasks(p.tasks, userId, planId);
      } else if (action.action === "DELETE_PLAN" && action.plan_id) {
        const planId = Number(action.plan_id);
        if (isNaN(planId)) continue;
        await db.delete(plansTable).where(and(eq(plansTable.id, planId), eq(plansTable.clerkUserId, userId)));
      }
    } catch (err) {
      logger.warn({ err, action: action.action }, "Failed to apply plan backend_action");
    }
  }
}
