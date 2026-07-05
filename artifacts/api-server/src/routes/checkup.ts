import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, conversations, messages, userProfilesTable, medicalDocumentsTable, tasksTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { invokeAgent, buildCarePlannerInput, type AgentCarePlannerOutput, type AgentTaskOutput } from "../lib/agentRouter";
import { applyPlanActions } from "../lib/planActions";

const router = Router();

// ─── Types ───────────────────────────────────────────────────────────────────

export type AssessmentData = {
  summary?: string;
  possible_causes?: string[];
  severity?: "low" | "medium" | "high" | "emergency";
  recovery_suggestions?: string[];
  food_nutrition_recommendations?: string[];
  medication_guidance?: string | Record<string, unknown>;
  doctor_recommendation?: string | Record<string, unknown>;
  warning_signs?: string[];
  profile_update_suggestions?: Record<string, unknown> | null;
  assessment_complete?: boolean;
  raw?: unknown;
};

export type EmergencyData = {
  first_aid_instructions?: string[];
  nearby_hospitals?: string[];
  recommended_specialists?: string[];
  emergency_contacts?: string[];
  immediate_actions?: string[];
  disclaimer?: string;
  raw?: unknown;
};

export type NutritionData = {
  recommended_foods?: string[];
  foods_to_avoid?: string[];
  meal_plan?: Record<string, unknown>;
  nutrition_tips?: string[];
  hydration_advice?: string;
  raw?: unknown;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseAgentOutput(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return { raw_text: raw }; }
  }
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return {};
}

function extractAssessment(output: Record<string, unknown>): AssessmentData | null {
  // Try multiple output structures from Agent 2
  const assessment = (output.assessment ?? output.health_assessment ?? output.checkup_result ?? null) as Record<string, unknown> | null;
  const isComplete =
    output.status === "ASSESSMENT_COMPLETE" ||
    output.assessment_complete === true ||
    output.complete === true ||
    (assessment !== null && !!assessment);

  if (!isComplete) return null;

  const src = assessment ?? output;

  return {
    summary: strVal(src.summary ?? src.assessment_summary ?? src.overview),
    possible_causes: arrVal(src.possible_causes ?? src.causes ?? src.differential_diagnosis),
    severity: normSeverity(src.severity ?? src.risk_level ?? src.urgency_level),
    recovery_suggestions: arrVal(src.recovery_suggestions ?? src.recommendations ?? src.treatment_plan),
    food_nutrition_recommendations: arrVal(src.food_nutrition_recommendations ?? src.nutrition_recommendations ?? src.dietary_advice),
    medication_guidance: (src.medication_guidance ?? src.medications ?? src.medication_advice) as string | Record<string, unknown> | undefined,
    doctor_recommendation: (src.doctor_recommendation ?? src.physician_advice ?? src.medical_referral) as string | Record<string, unknown> | undefined,
    warning_signs: arrVal(src.warning_signs ?? src.red_flags ?? src.danger_signs),
    profile_update_suggestions: (src.profile_update_suggestions ?? src.profile_updates ?? null) as Record<string, unknown> | null,
    raw: output,
  };
}

function extractFollowUp(output: Record<string, unknown>): string | null {
  if (output.status === "FOLLOW_UP" || output.follow_up === true || output.needs_clarification === true) {
    return strVal(output.response ?? output.message ?? output.question ?? output.follow_up_question) ?? null;
  }
  if (output.status !== "ASSESSMENT_COMPLETE" && !output.assessment && !output.assessment_complete) {
    const msg = strVal(output.response ?? output.message ?? output.question);
    if (msg) return msg;
  }
  return null;
}

function strVal(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (Array.isArray(v)) return v.map(String).join("; ");
  return undefined;
}

function arrVal(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(item => (typeof item === "string" ? item : JSON.stringify(item)));
  if (typeof v === "string") return v.split(/[,;]\s*/).filter(Boolean);
  return [];
}

function normSeverity(v: unknown): "low" | "medium" | "high" | "emergency" | undefined {
  const s = String(v ?? "").toLowerCase();
  if (!s) return undefined;
  if (s.includes("emergency") || s.includes("critical") || s.includes("immediate")) return "emergency";
  if (s.includes("high") || s.includes("severe") || s.includes("urgent")) return "high";
  if (s.includes("medium") || s.includes("moderate")) return "medium";
  if (s.includes("low") || s.includes("mild") || s.includes("minor")) return "low";
  return undefined;
}

function buildAssessmentSummaryText(assessment: AssessmentData): string {
  const lines: string[] = [];
  if (assessment.summary) lines.push(`📋 **Assessment Summary**\n${assessment.summary}`);
  if (assessment.possible_causes?.length) lines.push(`\n🔍 **Possible Causes**\n${assessment.possible_causes.map(c => `• ${c}`).join("\n")}`);
  if (assessment.severity) lines.push(`\n⚠️ **Severity:** ${assessment.severity.toUpperCase()}`);
  if (assessment.recovery_suggestions?.length) lines.push(`\n💊 **Recovery Suggestions**\n${assessment.recovery_suggestions.map(r => `• ${r}`).join("\n")}`);
  if (assessment.warning_signs?.length) lines.push(`\n🚨 **Warning Signs to Watch**\n${assessment.warning_signs.map(w => `• ${w}`).join("\n")}`);
  if (assessment.doctor_recommendation) {
    const rec = typeof assessment.doctor_recommendation === "string" ? assessment.doctor_recommendation : JSON.stringify(assessment.doctor_recommendation);
    lines.push(`\n👨‍⚕️ **Doctor Recommendation**\n${rec}`);
  }
  lines.push("\n*This is not medical advice. Please consult a qualified healthcare professional.*");
  return lines.join("\n") || "Your assessment is complete. Please review the detailed results below.";
}

// ─── GET assessment for existing conversation ─────────────────────────────────

router.get("/conversations/:id/assessment", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const [convo] = await db.select().from(conversations).where(and(eq(conversations.id, id), eq(conversations.clerkUserId, userId)));
    if (!convo) return res.status(404).json({ error: "Not found" });
    return res.json({ assessment: convo.checkupAssessment ?? null });
  } catch (err) {
    logger.error({ err }, "Failed to get assessment");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST message — main checkup flow ─────────────────────────────────────────

router.post("/conversations/:id/message", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { content } = req.body;
  if (!content?.trim()) { res.status(400).json({ error: "content is required" }); return; }

  try {
    // Verify ownership
    const [convo] = await db.select().from(conversations).where(and(eq(conversations.id, id), eq(conversations.clerkUserId, userId)));
    if (!convo) { res.status(404).json({ error: "Conversation not found" }); return; }

    // Save user message
    const [userMsg] = await db.insert(messages).values({ conversationId: id, role: "user", content: content.trim() }).returning();

    // Load history
    const historyRows = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.createdAt);
    const conversationHistory = historyRows.slice(-30).map(m => ({ role: m.role, content: m.content }));

    // Load user profile
    const [profile] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.clerkUserId, userId));
    if (!profile) { res.status(404).json({ error: "Profile not found. Complete onboarding first." }); return; }

    // Load recent medical documents
    const recentDocs = await db.select().from(medicalDocumentsTable)
      .where(and(eq(medicalDocumentsTable.clerkUserId, userId), eq(medicalDocumentsTable.belongsToUser, true)))
      .orderBy(desc(medicalDocumentsTable.uploadedAt))
      .limit(5);

    const docSummaries = recentDocs.map(d => `${d.filename}: ${d.summary ?? "No summary"}`);

    // Build Agent 2 input
    const agent2Input: Record<string, unknown> = {
      user_message: content.trim(),
      conversation_history: conversationHistory.slice(0, -1), // exclude the message we just saved
      user_profile: {
        name: profile.name,
        age: profile.age,
        gender: profile.gender,
        blood_group: profile.bloodGroup,
        weight: profile.weight,
        height: profile.height,
        activity_level: profile.activityLevel,
        sleep_hours: profile.sleepHours,
        goals: profile.goals,
        location: profile.location,
      },
      medical_conditions: profile.medicalConditions ? [profile.medicalConditions] : [],
      current_medications: profile.medications ? [profile.medications] : [],
      allergies: profile.allergies ? [profile.allergies] : [],
      recent_medical_documents: docSummaries,
    };

    logger.info({ conversationId: id, userId }, "Invoking Agent 2 for checkup");

    // Call Agent 2
    let agent2RawOutput: unknown;
    try {
      agent2RawOutput = await invokeAgent("agent2", agent2Input, 90000);
    } catch (agentErr) {
      logger.error({ agentErr }, "Agent 2 failed");
      // Fallback to Gemini-based response (keep old behavior working)
      const fallbackMsg = "I'm having trouble connecting to the health assessment service. Please try again in a moment, or describe your symptoms and I'll do my best to help.";
      const [assistantMsg] = await db.insert(messages).values({ conversationId: id, role: "assistant", content: fallbackMsg }).returning();
      res.json({ userMessage: userMsg, assistantMessage: assistantMsg, status: "error", error: "Agent temporarily unavailable" });
      return;
    }

    const output = parseAgentOutput(agent2RawOutput);
    logger.info({ conversationId: id, outputKeys: Object.keys(output) }, "Agent 2 responded");

    // Check if assessment is complete
    const assessment = extractAssessment(output);
    const followUpText = assessment ? null : extractFollowUp(output);

    // ── FOLLOW_UP ──────────────────────────────────────────────────────────────
    if (!assessment) {
      const questionText = followUpText
        ?? strVal(output.response ?? output.message ?? output.question ?? output.raw_text)
        ?? "Could you tell me more about your symptoms? How long have you been experiencing them?";

      const [assistantMsg] = await db.insert(messages).values({ conversationId: id, role: "assistant", content: questionText }).returning();
      res.json({ userMessage: userMsg, assistantMessage: assistantMsg, status: "follow_up" });
      return;
    }

    // ── ASSESSMENT_COMPLETE — orchestrate parallel agents ─────────────────────
    logger.info({ conversationId: id, severity: assessment.severity }, "Assessment complete, orchestrating agents");

    const isEmergency = assessment.severity === "emergency";
    const hasNutrition = !!(assessment.food_nutrition_recommendations?.length
      || (output.nutrition || output.food_recommendations));
    const needsCarePlan = !!(assessment.recovery_suggestions?.length || isEmergency);

    // Parallel orchestration
    const [emergencyResult, nutritionResult, carePlanResult] = await Promise.allSettled([
      // Agent 4 — Emergency Navigator (only if emergency)
      isEmergency
        ? invokeAgent("agent4", {
            assessment_summary: assessment.summary ?? "Emergency situation detected",
            symptoms: assessment.possible_causes ?? [],
            severity: assessment.severity,
            user_profile: {
              name: profile.name,
              age: profile.age,
              blood_group: profile.bloodGroup,
              medical_conditions: profile.medicalConditions,
              medications: profile.medications,
              location: profile.location ?? "unknown",
            },
            first_aid_needed: true,
          }, 90000)
        : Promise.resolve(null),

      // Agent 5 — NutriWise (only if nutrition data present)
      hasNutrition
        ? invokeAgent("agent5", {
            user_profile: {
              name: profile.name,
              age: profile.age,
              gender: profile.gender,
              weight: profile.weight,
              height: profile.height,
              activity_level: profile.activityLevel,
              goals: profile.goals,
            },
            health_assessment: {
              summary: assessment.summary,
              possible_causes: assessment.possible_causes,
              severity: assessment.severity,
              recovery_suggestions: assessment.recovery_suggestions,
            },
            medical_conditions: profile.medicalConditions ? [profile.medicalConditions] : [],
            dietary_restrictions: profile.allergies ? [profile.allergies] : [],
            current_medications: profile.medications ? [profile.medications] : [],
            nutrition_goals: assessment.food_nutrition_recommendations ?? [],
          }, 90000)
        : Promise.resolve(null),

      // Agent 3 — Care Planner (if care plan needed)
      needsCarePlan
        ? (async () => {
            const currentTasks = await db.select().from(tasksTable).where(eq(tasksTable.clerkUserId, userId));
            const input = buildCarePlannerInput({
              userProfile: { ...profile },
              currentTasks,
              dailyLogs: [],
              medicalConditions: profile.medicalConditions ? [profile.medicalConditions] : [],
              currentMedications: profile.medications ? [profile.medications] : [],
              healthAssessment: {
                summary: assessment.summary,
                severity: assessment.severity,
                recovery_suggestions: assessment.recovery_suggestions,
                possible_causes: assessment.possible_causes,
              },
              userMessage: `Create a care plan based on this health assessment: ${assessment.summary ?? "See assessment data"}`,
            });
            return invokeAgent("agent3", input, 90000);
          })()
        : Promise.resolve(null),
    ]);

    // Process emergency data
    let emergencyData: EmergencyData | null = null;
    if (isEmergency && emergencyResult.status === "fulfilled" && emergencyResult.value) {
      const eOut = parseAgentOutput(emergencyResult.value);
      emergencyData = {
        first_aid_instructions: arrVal(eOut.first_aid_instructions ?? eOut.immediate_actions ?? eOut.first_aid),
        nearby_hospitals: arrVal(eOut.nearby_hospitals ?? eOut.hospitals ?? eOut.emergency_facilities),
        recommended_specialists: arrVal(eOut.recommended_specialists ?? eOut.specialists),
        emergency_contacts: arrVal(eOut.emergency_contacts ?? eOut.contacts),
        immediate_actions: arrVal(eOut.immediate_actions ?? eOut.steps),
        disclaimer: strVal(eOut.disclaimer ?? eOut.warning),
        raw: eOut,
      };
    } else if (isEmergency && emergencyResult.status === "rejected") {
      logger.error({ err: emergencyResult.reason }, "Agent 4 failed");
      emergencyData = {
        first_aid_instructions: ["Call emergency services (911) immediately", "Stay calm and do not leave the person alone", "Keep the person still and comfortable until help arrives"],
        recommended_specialists: ["Emergency Room Physician", "Relevant specialist based on symptoms"],
        emergency_contacts: ["911 (US Emergency)", "Your local emergency number"],
        disclaimer: "This is an AI-generated emergency response. Always call emergency services immediately.",
      };
    }

    // Process nutrition data
    let nutritionData: NutritionData | null = null;
    if (nutritionResult.status === "fulfilled" && nutritionResult.value) {
      const nOut = parseAgentOutput(nutritionResult.value);
      nutritionData = {
        recommended_foods: arrVal(nOut.recommended_foods ?? nOut.foods_to_include ?? nOut.beneficial_foods),
        foods_to_avoid: arrVal(nOut.foods_to_avoid ?? nOut.avoid_foods ?? nOut.restrict_foods),
        meal_plan: (nOut.meal_plan ?? nOut.diet_plan ?? nOut.meal_recommendations) as Record<string, unknown>,
        nutrition_tips: arrVal(nOut.nutrition_tips ?? nOut.dietary_tips ?? nOut.health_tips),
        hydration_advice: strVal(nOut.hydration_advice ?? nOut.water_intake),
        raw: nOut,
      };
    }

    // Process care plan tasks
    const newTasks: unknown[] = [];
    if (carePlanResult.status === "fulfilled" && carePlanResult.value) {
      const cOut = carePlanResult.value as AgentCarePlannerOutput;
      const todayTasks: AgentTaskOutput[] = cOut?.today_tasks ?? [];
      const actions = cOut?.backend_actions ?? [];

      for (const task of todayTasks) {
        const [created] = await db.insert(tasksTable).values({
          clerkUserId: userId,
          title: task.title,
          description: task.description ?? null,
          category: task.category ?? "general",
          priority: task.priority ?? "medium",
          dueTime: task.due_time ?? null,
          sourceAgent: "agent3",
        }).returning();
        newTasks.push(created);
      }

      for (const action of actions) {
        if (action.action === "CREATE_TASK" && action.task) {
          const t = action.task;
          const [created] = await db.insert(tasksTable).values({
            clerkUserId: userId,
            title: t.title,
            description: t.description ?? null,
            category: t.category ?? "general",
            priority: t.priority ?? "medium",
            dueTime: t.due_time ?? null,
            sourceAgent: "agent3",
          }).returning();
          newTasks.push(created);
        }
      }
      await applyPlanActions(actions, userId);
    } else if (carePlanResult.status === "rejected") {
      logger.warn({ err: carePlanResult.reason }, "Agent 3 failed for care plan");
    }

    // Attach nutrition data from Agent 5 to assessment if available
    if (nutritionData?.recommended_foods?.length) {
      assessment.food_nutrition_recommendations = [
        ...(assessment.food_nutrition_recommendations ?? []),
        ...nutritionData.recommended_foods,
      ];
    }

    // Store assessment in conversation
    const fullAssessmentPayload = { assessment, emergencyData, nutritionData };
    await db.update(conversations).set({ checkupAssessment: fullAssessmentPayload }).where(eq(conversations.id, id));

    // Save human-readable summary as assistant message
    const summaryText = buildAssessmentSummaryText(assessment);
    const [assistantMsg] = await db.insert(messages).values({ conversationId: id, role: "assistant", content: summaryText }).returning();

    return res.json({
      userMessage: userMsg,
      assistantMessage: assistantMsg,
      status: "assessment_complete",
      assessment,
      emergencyData,
      nutritionData,
      newTasks,
      profileSuggestions: assessment.profile_update_suggestions ?? null,
    });
  } catch (err) {
    logger.error({ err }, "Checkup agent route failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
