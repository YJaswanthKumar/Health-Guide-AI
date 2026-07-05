import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, plansTable, type Plan } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { CreatePlanBody, UpdatePlanBody, GetPlanParams, UpdatePlanParams, DeletePlanParams } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router = Router();

function withComputedFields(plan: Plan) {
  let progress: number | null = null;
  let daysRemaining: number | null = null;

  if (plan.status === "completed") {
    progress = 100;
  } else if (plan.status === "cancelled") {
    progress = null;
  } else if (plan.startDate && plan.endDate) {
    const start = new Date(plan.startDate).getTime();
    const end = new Date(plan.endDate).getTime();
    const now = Date.now();
    if (!isNaN(start) && !isNaN(end) && end > start) {
      const pct = ((now - start) / (end - start)) * 100;
      progress = Math.max(0, Math.min(100, Math.round(pct)));
      daysRemaining = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
    }
  }

  return { ...plan, progress, daysRemaining };
}

function computeDurationDays(startDate?: string | null, endDate?: string | null): number | null {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (isNaN(start) || isNaN(end) || end < start) return null;
  return Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
}

router.get("/", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const plans = await db.select().from(plansTable).where(eq(plansTable.clerkUserId, userId));
    return res.json(plans.map(withComputedFields));
  } catch (err) {
    logger.error({ err }, "Failed to list plans");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const parsed = CreatePlanBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  try {
    const durationDays = computeDurationDays(parsed.data.startDate, parsed.data.endDate);
    const plan = await db.insert(plansTable).values({
      clerkUserId: userId,
      ...parsed.data,
      durationDays,
    }).returning();
    return res.status(201).json(withComputedFields(plan[0]));
  } catch (err) {
    logger.error({ err }, "Failed to create plan");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const params = GetPlanParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });
  try {
    const plans = await db.select().from(plansTable).where(and(eq(plansTable.id, params.data.id), eq(plansTable.clerkUserId, userId)));
    if (!plans.length) return res.status(404).json({ error: "Not found" });
    return res.json(withComputedFields(plans[0]));
  } catch (err) {
    logger.error({ err }, "Failed to get plan");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const params = UpdatePlanParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });
  const parsed = UpdatePlanBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  try {
    const existing = await db.select().from(plansTable).where(and(eq(plansTable.id, params.data.id), eq(plansTable.clerkUserId, userId)));
    if (!existing.length) return res.status(404).json({ error: "Not found" });
    const nextStart = parsed.data.startDate ?? existing[0].startDate;
    const nextEnd = parsed.data.endDate ?? existing[0].endDate;
    const durationDays = computeDurationDays(nextStart, nextEnd);
    const updated = await db.update(plansTable)
      .set({ ...parsed.data, durationDays })
      .where(and(eq(plansTable.id, params.data.id), eq(plansTable.clerkUserId, userId)))
      .returning();
    if (!updated.length) return res.status(404).json({ error: "Not found" });
    return res.json(withComputedFields(updated[0]));
  } catch (err) {
    logger.error({ err }, "Failed to update plan");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const params = DeletePlanParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });
  try {
    await db.delete(plansTable).where(and(eq(plansTable.id, params.data.id), eq(plansTable.clerkUserId, userId)));
    return res.status(204).send();
  } catch (err) {
    logger.error({ err }, "Failed to delete plan");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
