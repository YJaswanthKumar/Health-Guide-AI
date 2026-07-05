import { db, plansTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import type { AgentCarePlannerOutput, AgentPlanOutput } from "./agentRouter";

function computeDurationDays(startDate?: string | null, endDate?: string | null): number | null {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (isNaN(start) || isNaN(end) || end < start) return null;
  return Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
}

type BackendAction = NonNullable<AgentCarePlannerOutput["backend_actions"]>[number];

export async function applyPlanActions(actions: BackendAction[], userId: string): Promise<void> {
  for (const action of actions) {
    try {
      if (action.action === "CREATE_PLAN" && action.plan) {
        const p = action.plan;
        const durationDays = computeDurationDays(p.start_date, p.end_date);
        await db.insert(plansTable).values({
          clerkUserId: userId,
          title: p.title,
          type: p.type ?? "custom",
          description: p.description ?? null,
          status: p.status ?? "active",
          startDate: p.start_date ?? null,
          endDate: p.end_date ?? null,
          durationDays,
        });
      } else if (action.action === "UPDATE_PLAN" && action.plan_id) {
        const planId = Number(action.plan_id);
        if (isNaN(planId)) continue;
        const p: Partial<AgentPlanOutput> = action.plan ?? {};
        const [existing] = await db.select().from(plansTable).where(and(eq(plansTable.id, planId), eq(plansTable.clerkUserId, userId)));
        if (!existing) continue;
        const nextStart = p.start_date ?? existing.startDate;
        const nextEnd = p.end_date ?? existing.endDate;
        const durationDays = computeDurationDays(nextStart, nextEnd);
        const updates: Record<string, unknown> = { durationDays };
        if (p.title !== undefined) updates.title = p.title;
        if (p.type !== undefined) updates.type = p.type;
        if (p.description !== undefined) updates.description = p.description;
        if (p.status !== undefined) updates.status = p.status;
        if (p.start_date !== undefined) updates.startDate = p.start_date;
        if (p.end_date !== undefined) updates.endDate = p.end_date;
        await db.update(plansTable).set(updates).where(and(eq(plansTable.id, planId), eq(plansTable.clerkUserId, userId)));
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
