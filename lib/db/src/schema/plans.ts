import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { userProfilesTable } from "./users";

export const plansTable = pgTable("plans", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  title: text("title").notNull(),
  type: text("type").notNull(),
  category: text("category"),
  description: text("description"),
  status: text("status").notNull().default("active"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  durationDays: integer("duration_days"),
  completedDays: integer("completed_days"),
  remainingDays: integer("remaining_days"),
  progressPercentage: integer("progress_percentage"),
  currentDay: integer("current_day"),
  sourceAgent: text("source_agent").default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPlanSchema = createInsertSchema(plansTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Plan = typeof plansTable.$inferSelect;
