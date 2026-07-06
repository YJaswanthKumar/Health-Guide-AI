import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, conversations, messages, userProfilesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import { invokeAgent } from "../lib/agentRouter";
import { GoogleGenAI } from "@google/genai";

const router = Router();

// ─── Gemini fallback ─────────────────────────────────────────────────────────

let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!_ai) {
    const apiKey =
      process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error("No Gemini API key configured.");
    const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    _ai = baseUrl
      ? new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "", baseUrl } })
      : new GoogleGenAI({ apiKey });
  }
  return _ai;
}

const EDUCATION_SYSTEM_PROMPT = `You are VitalGuide AI, a friendly and evidence-based health educator. Help users understand health topics accurately and in plain language.

Guidelines:
- Provide accurate, evidence-based information. Avoid jargon — if you must use a technical term, immediately define it.
- Proactively bust common myths about diet, weight loss, sleep, supplements, and popular health trends.
- When asked about a food or supplement: cover nutritional value, proven benefits, potential risks, and who should avoid it.
- When asked about a medical condition or medication: explain what it is, how it works, common symptoms, and general management — in simple, human terms.
- Personalize your answer using the user's profile when clearly relevant.
- Match response length to the question: short for simple facts, structured for complex topics. Use headers or bullet points for long explanations.
- End with an invitation: "Would you like me to go deeper on any part of this?"`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractAgent5Response(raw: unknown): string | null {
  const output: Record<string, unknown> =
    typeof raw === "string"
      ? (() => { try { return JSON.parse(raw); } catch { return { raw_text: raw }; } })()
      : (raw && typeof raw === "object" ? raw as Record<string, unknown> : {});

  // Direct text fields Agent 5 might return
  const direct =
    output.response ??
    output.message ??
    output.answer ??
    output.content ??
    output.education_content ??
    output.nutrition_guidance ??
    output.guidance ??
    output.raw_text;

  if (typeof direct === "string" && direct.trim()) return direct.trim();

  // Build from structured fields
  const lines: string[] = [];
  if (output.summary) lines.push(String(output.summary));
  const addList = (key: string, label: string) => {
    const v = output[key];
    if (Array.isArray(v) && v.length) {
      lines.push(`\n**${label}**`);
      v.forEach(item => lines.push(`• ${item}`));
    }
  };
  addList("key_points", "Key Points");
  addList("recommendations", "Recommendations");
  addList("tips", "Tips");
  addList("nutrition_tips", "Nutrition Tips");
  addList("health_tips", "Health Tips");
  addList("recommended_foods", "Recommended Foods");
  addList("foods_to_avoid", "Foods to Avoid");

  if (output.hydration_advice) lines.push(`\n💧 **Hydration:** ${output.hydration_advice}`);

  return lines.length > 0 ? lines.join("\n") : null;
}

// ─── POST /conversations/:id/message ─────────────────────────────────────────

router.post("/conversations/:id/message", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { content } = req.body;
  if (!content?.trim()) { res.status(400).json({ error: "content is required" }); return; }

  try {
    // Verify ownership
    const [convo] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.clerkUserId, userId)));
    if (!convo) { res.status(404).json({ error: "Conversation not found" }); return; }
    if (convo.mode !== "education") { res.status(400).json({ error: "This endpoint is only for education conversations" }); return; }

    // Save user message
    const [userMsg] = await db
      .insert(messages)
      .values({ conversationId: id, role: "user", content: content.trim() })
      .returning();

    // Load full history (for context)
    const historyRows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(messages.createdAt);
    const conversationHistory = historyRows
      .slice(-20)
      .map(m => ({ role: m.role, content: m.content }));

    // Load user profile
    const [profile] = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.clerkUserId, userId));

    let responseText: string | null = null;

    // ── Attempt Agent 5 (NutriWise Nutrition Intelligence) ──────────────────
    try {
      const agent5Input: Record<string, unknown> = {
        user_message: content.trim(),
        conversation_history: conversationHistory.slice(0, -1), // exclude the message just saved
        topic: convo.title ?? "general health",
        education_mode: true,
        user_profile: profile
          ? {
              name: profile.name,
              age: profile.age,
              gender: profile.gender,
              weight: profile.weight,
              height: profile.height,
              activity_level: profile.activityLevel,
              sleep_hours: profile.sleepHours,
              goals: profile.goals,
              location: profile.location,
            }
          : {},
        medical_conditions: profile?.medicalConditions ? [profile.medicalConditions] : [],
        dietary_restrictions: profile?.allergies ? [profile.allergies] : [],
        current_medications: profile?.medications ? [profile.medications] : [],
        nutrition_goals: profile?.goals ? [profile.goals] : [],
      };

      logger.info({ conversationId: id, userId }, "Invoking Agent 5 for education");
      const raw = await invokeAgent("agent5", agent5Input, 90000);
      responseText = extractAgent5Response(raw);
      logger.info({ conversationId: id, hasResponse: !!responseText }, "Agent 5 education response received");
    } catch (agentErr) {
      logger.warn({ agentErr }, "Agent 5 unavailable for education, falling back to Gemini");
    }

    // ── Gemini fallback ──────────────────────────────────────────────────────
    if (!responseText) {
      let systemPrompt = EDUCATION_SYSTEM_PROMPT;
      if (profile) {
        systemPrompt += `\n\n=== USER HEALTH PROFILE ===\nName: ${profile.name} | Age: ${profile.age} | Gender: ${profile.gender ?? "unspecified"}\nConditions: ${profile.medicalConditions ?? "none"} | Medications: ${profile.medications ?? "none"}\nGoals: ${profile.goals ?? "none"} | Activity: ${profile.activityLevel ?? "unknown"}`;
      }

      const chatContents = conversationHistory.slice(-20).map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

      try {
        const geminiRes = await getAI().models.generateContent({
          model: "gemini-2.5-flash",
          contents: chatContents,
          config: { systemInstruction: systemPrompt, maxOutputTokens: 2048 },
        });
        responseText = geminiRes.text?.trim() || null;
      } catch (geminiErr) {
        logger.error({ geminiErr }, "Gemini fallback also failed for education");
      }
    }

    if (!responseText) {
      responseText = "I'm having trouble answering that right now. Please try again in a moment.";
    }

    const [assistantMsg] = await db
      .insert(messages)
      .values({ conversationId: id, role: "assistant", content: responseText })
      .returning();

    return res.json({ userMessage: userMsg, assistantMessage: assistantMsg });
  } catch (err) {
    logger.error({ err }, "Education agent route failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
