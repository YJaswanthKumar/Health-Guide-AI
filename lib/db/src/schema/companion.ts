import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const companionMessagesTable = pgTable("companion_messages", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  role: text("role").notNull().default("assistant"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCompanionMessageSchema = createInsertSchema(companionMessagesTable).omit({
  id: true,
  createdAt: true,
});

export type CompanionMessage = typeof companionMessagesTable.$inferSelect;
export type InsertCompanionMessage = z.infer<typeof insertCompanionMessageSchema>;
