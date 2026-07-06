import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, conversations, messages, userProfilesTable, medicalDocumentsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { CreateConversationBody, SendMessageBody, GetConversationMessagesParams } from "@workspace/api-zod";
import { GoogleGenAI } from "@google/genai";
import { logger } from "../lib/logger";

const router = Router();

let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!_ai) {
    const apiKey =
      process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error("No Gemini API key configured. Please add GEMINI_API_KEY to your secrets.");
    }
    const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    _ai = baseUrl
      ? new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "", baseUrl } })
      : new GoogleGenAI({ apiKey });
  }
  return _ai;
}

const SYSTEM_PROMPTS: Record<string, string> = {
  checkup: `You are VitalGuide AI, a compassionate and knowledgeable health assistant. Help users understand their symptoms and health concerns clearly and safely.

Guidelines:
- Match response length to complexity — brief for simple queries, thorough for complex ones. Never pad; never cut short.
- Always use the user's health profile (name, age, conditions, medications, vitals) to personalize your response.
- Ask at most 1-2 focused follow-up questions when you need more information before giving advice. Never overwhelm with multiple questions at once.
- NEVER diagnose. Describe what symptoms may indicate and explain why they should see a doctor for a proper diagnosis.
- For potential emergencies (chest pain, difficulty breathing, sudden severe pain, signs of stroke, confusion, very high fever ≥104°F/40°C, or anything life-threatening): immediately lead with "⚠️ This could be a medical emergency — please call 911 (or your local emergency number) or go to the nearest ER right away." Then briefly explain why.
- Suggest safe OTC remedies only for clearly minor, common issues (mild headache, common cold, small cut). For anything beyond minor, always advise professional care.
- Cross-check any advice against the user's listed medications and conditions — flag potential interactions or contraindications explicitly.
- End every response with: "*This is not medical advice. Please consult a qualified doctor for proper diagnosis and treatment.*"`,

  planner: `You are VitalGuide AI, a supportive and practical personal health coach. Help users build and maintain healthy daily habits aligned with their goals and medical needs.

Guidelines:
- Use the user's profile (conditions, goals, activity level, sleep, medications) to give personalized, relevant advice.
- Help with medication schedules, diet choices, exercise routines, hydration, sleep, and other wellness habits.
- When a user reports a deviation (skipped medication, missed workout, poor diet), respond without shame — acknowledge it briefly, then redirect positively toward the next step.
- Give specific, actionable guidance rather than general platitudes. For example: "Since you mentioned skipping breakfast, have a small protein-rich snack within the hour to stabilize your blood sugar."
- Factor in medical conditions when recommending exercise or food (e.g., low-impact for joint issues, low-glycaemic for diabetes, low-sodium for hypertension).
- Reference logged data (meals, water intake, mood, sleep) when the user shares it, to show continuity and care.
- Use bullet points for action items when helpful. Keep responses focused and practical.`,

  education: `You are VitalGuide AI, a friendly and evidence-based health educator. Help users understand health topics accurately and in plain language.

Guidelines:
- Provide accurate, evidence-based information. Avoid jargon — if you must use a technical term, immediately define it in simple words.
- Proactively bust common myths, especially about diet, weight loss, sleep, supplements, and popular health trends.
- When asked about a food or supplement: cover its nutritional value, proven health benefits, potential risks or side effects, and who should avoid or limit it.
- When asked about a medical condition or medication: explain what it is, how it works, common symptoms or effects, and general management approaches — in simple, human terms.
- Personalize your answer using the user's profile when clearly relevant (e.g., "Given that you have Type 2 diabetes, here's what's particularly important about this…").
- Match response length to the question: short and direct for simple facts, structured and detailed for complex topics. Use headers or bullet points for long explanations.
- End with an invitation: "Would you like me to go deeper on any part of this?"`,
};

router.delete("/conversations/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    // Verify ownership before any deletion; messages cascade via FK
    const deleted = await db
      .delete(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.clerkUserId, userId)))
      .returning({ id: conversations.id });
    if (!deleted.length) return res.status(404).json({ error: "Conversation not found" });
    return res.status(204).send();
  } catch (err) {
    logger.error({ err }, "Failed to delete conversation");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/conversations/:id", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (!title) return res.status(400).json({ error: "Title is required" });
  try {
    const updated = await db
      .update(conversations)
      .set({ title, updatedAt: new Date() })
      .where(and(eq(conversations.id, id), eq(conversations.clerkUserId, userId)))
      .returning();
    if (!updated.length) return res.status(404).json({ error: "Conversation not found" });
    return res.json(updated[0]);
  } catch (err) {
    logger.error({ err }, "Failed to rename conversation");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/conversations", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const convos = await db.select().from(conversations).where(eq(conversations.clerkUserId, userId));
    return res.json(convos);
  } catch (err) {
    logger.error({ err }, "Failed to list conversations");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/conversations", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const parsed = CreateConversationBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  try {
    const convo = await db.insert(conversations).values({ clerkUserId: userId, ...parsed.data }).returning();
    return res.status(201).json(convo[0]);
  } catch (err) {
    logger.error({ err }, "Failed to create conversation");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/conversations/:id/messages", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const params = GetConversationMessagesParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });
  try {
    // Verify conversation ownership before returning messages
    const convoRows = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.id, params.data.id), eq(conversations.clerkUserId, userId)));
    if (!convoRows.length) return res.status(404).json({ error: "Conversation not found" });
    const msgs = await db.select().from(messages).where(eq(messages.conversationId, params.data.id));
    return res.json(msgs);
  } catch (err) {
    logger.error({ err }, "Failed to get messages");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/conversations/:id/messages", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const params = GetConversationMessagesParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const convoRows = await db.select().from(conversations).where(and(eq(conversations.id, params.data.id), eq(conversations.clerkUserId, userId)));
    if (!convoRows.length) { res.status(404).json({ error: "Conversation not found" }); return; }
    const convo = convoRows[0];

    await db.insert(messages).values({ conversationId: params.data.id, role: "user", content: parsed.data.content });

    const historyRows = await db.select().from(messages).where(eq(messages.conversationId, params.data.id));

    const profiles = await db.select().from(userProfilesTable).where(eq(userProfilesTable.clerkUserId, userId));
    const profile = profiles[0];

    let systemPrompt = SYSTEM_PROMPTS[convo.mode] ?? SYSTEM_PROMPTS.education;

    if (profile) {
      const additionalDetails: Record<string, unknown> = (() => {
        try { return profile.additionalDetails ? JSON.parse(profile.additionalDetails) : {}; } catch { return {}; }
      })();

      systemPrompt += `\n\n=== USER HEALTH PROFILE ===
Name: ${profile.name} | Age: ${profile.age} | Gender: ${profile.gender ?? "unspecified"}
Blood Group: ${profile.bloodGroup ?? "unknown"} | Weight: ${profile.weight ?? "?"}kg | Height: ${profile.height ?? "?"}cm
Conditions: ${profile.medicalConditions ?? "none"} | Medications: ${profile.medications ?? "none"}
Allergies: ${profile.allergies ?? "none"} | Sleep: ${profile.sleepHours ?? "?"}hrs | Activity: ${profile.activityLevel ?? "unknown"}
Goals: ${profile.goals ?? "none"} | Location: ${profile.location ?? "unknown"}`;

      if (Object.keys(additionalDetails).length > 0) {
        const vitalsText = Object.entries(additionalDetails)
          .filter(([k]) => k !== "summary")
          .map(([k, v]) => {
            const label = k.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase());
            const val = Array.isArray(v) ? (v as unknown[]).join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v);
            return `${label}: ${val}`;
          })
          .join(" | ");
        systemPrompt += `\nVitals/Labs: ${vitalsText}`;
      }
    }

    if (convo.mode === "checkup" && userId) {
      try {
        const recentDocs = await db.select().from(medicalDocumentsTable)
          .where(and(eq(medicalDocumentsTable.clerkUserId, userId), eq(medicalDocumentsTable.belongsToUser, true)))
          .orderBy(desc(medicalDocumentsTable.uploadedAt))
          .limit(3);

        if (recentDocs.length > 0) {
          const docContext = recentDocs.map(d => {
            const date = d.documentDate ?? d.uploadedAt.toISOString().split("T")[0];
            return `- ${d.filename} (${date}): ${d.summary ?? "No summary"}`;
          }).join("\n");
          systemPrompt += `\n\n=== RECENT MEDICAL DOCUMENTS ===\n${docContext}`;
        }
      } catch (docErr) {
        logger.warn({ docErr }, "Failed to fetch documents for checkup context");
      }
    }

    const chatContents = historyRows.slice(-20).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullResponse = "";

    const stream = await getAI().models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: chatContents,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: 2048,
      },
    });

    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
      }
    }

    await db.insert(messages).values({ conversationId: params.data.id, role: "assistant", content: fullResponse });

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err: any) {
    logger.error({ err }, "Failed to send message");

    let userMessage = "Something went wrong. Please try again.";
    const msg: string = err?.message ?? "";

    if (msg.includes("API_KEY_INVALID") || msg.includes("invalid api key") || msg.toLowerCase().includes("api key not valid")) {
      userMessage = "Invalid Gemini API key. Please check your GEMINI_API_KEY secret.";
    } else if (msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota") || msg.includes("429")) {
      userMessage = "Gemini API quota exceeded. Please check your Google AI billing or wait before retrying.";
    } else if (msg.includes("PERMISSION_DENIED")) {
      userMessage = "Gemini API key does not have permission. Ensure the Gemini API is enabled in your Google Cloud project.";
    } else if (msg.includes("No Gemini API key")) {
      userMessage = "No Gemini API key configured. Please add GEMINI_API_KEY to your secrets.";
    }

    if (!res.headersSent) {
      res.status(500).json({ error: userMessage });
      return;
    }
    res.write(`data: ${JSON.stringify({ error: userMessage })}\n\n`);
    res.end();
  }
});

export default router;
