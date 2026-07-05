import { logger } from "./logger";

const AGENTS = {
  agent1: {
    url: "https://agent-1-health-assessment-check-up-intellig-1dc82804.crewai.com",
    token: "e4e8b0ade661",
  },
  agent2: {
    url: "https://agent-2-health-assessment-v1-f8f3c084-83c5--699b282f.crewai.com",
    token: "9291998bc791",
  },
  agent3: {
    url: "https://agent-3-intelligent-care-planner-21e241b6-5-4dc6483c.crewai.com",
    token: "d8fa917bc5bb",
  },
  agent4: {
    url: "https://agent-4-emergency-navigator-agent-v1-395711-fc767e98.crewai.com",
    token: "428828ceb133",
  },
  agent5: {
    url: "https://agent-5-nutriwise-nutrition-intelligence-ra-57fa0f34.crewai.com",
    token: "7f4bfc5ea7e6",
  },
} as const;

type AgentKey = keyof typeof AGENTS;

async function kickoff(agentKey: AgentKey, inputs: Record<string, unknown>): Promise<string> {
  const agent = AGENTS[agentKey];
  const res = await fetch(`${agent.url}/kickoff`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${agent.token}`,
    },
    body: JSON.stringify({ inputs }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Agent ${agentKey} kickoff failed: ${res.status} ${text}`);
  }

  const data = await res.json() as { kickoff_id?: string; id?: string };
  const kickoffId = data.kickoff_id ?? data.id;
  if (!kickoffId) throw new Error(`Agent ${agentKey} kickoff returned no kickoff_id`);
  return kickoffId;
}

async function pollStatus(
  agentKey: AgentKey,
  kickoffId: string,
  maxWaitMs = 60000,
  intervalMs = 3000,
): Promise<unknown> {
  const agent = AGENTS[agentKey];
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, intervalMs));

    const res = await fetch(`${agent.url}/status/${kickoffId}`, {
      headers: { Authorization: `Bearer ${agent.token}` },
    });

    if (!res.ok) {
      logger.warn({ agentKey, kickoffId, status: res.status }, "Agent status check failed, retrying");
      continue;
    }

    const data = await res.json() as { state?: string; status?: string; result?: unknown; output?: unknown };
    const state = (data.state ?? data.status ?? "").toUpperCase();

    if (state === "SUCCESS" || state === "COMPLETED") {
      const raw = data.result ?? data.output;
      if (typeof raw === "string") {
        try { return JSON.parse(raw); } catch { return { raw_text: raw }; }
      }
      return raw;
    }

    if (state === "FAILED" || state === "ERROR") {
      throw new Error(`Agent ${agentKey} execution failed`);
    }

    logger.debug({ agentKey, kickoffId, state }, "Agent still running");
  }

  throw new Error(`Agent ${agentKey} timed out after ${maxWaitMs}ms`);
}

export async function invokeAgent(
  agentKey: AgentKey,
  inputs: Record<string, unknown>,
  maxWaitMs = 60000,
): Promise<unknown> {
  logger.info({ agentKey }, "Invoking agent");
  try {
    const kickoffId = await kickoff(agentKey, inputs);
    logger.info({ agentKey, kickoffId }, "Agent kicked off");
    const result = await pollStatus(agentKey, kickoffId, maxWaitMs);
    logger.info({ agentKey, kickoffId }, "Agent completed");
    return result;
  } catch (err) {
    logger.error({ agentKey, err }, "Agent invocation failed");
    throw err;
  }
}

export function buildCarePlannerInput(opts: {
  userProfile: Record<string, unknown>;
  currentTasks: unknown[];
  dailyLogs: unknown[];
  medicalConditions: string[];
  currentMedications: string[];
  userMessage?: string;
  conversationHistory?: unknown[];
  healthAssessment?: Record<string, unknown>;
  nutritionPlan?: Record<string, unknown>;
}) {
  return {
    user_profile: opts.userProfile,
    health_assessment: opts.healthAssessment ?? {},
    nutrition_plan: opts.nutritionPlan ?? {},
    medical_conditions: opts.medicalConditions,
    current_medications: opts.currentMedications,
    daily_logs: opts.dailyLogs,
    current_tasks: opts.currentTasks,
    previous_progress: [],
    calendar: {},
    recovery_status: {},
    emergency_output: {},
    user_message: opts.userMessage ?? "",
    conversation_history: opts.conversationHistory ?? [],
  };
}

export type AgentTaskOutput = {
  id?: string | number;
  title: string;
  description?: string;
  category?: string;
  priority?: string;
  due_time?: string;
  recurrence?: string;
  status?: string;
  completed?: boolean;
};

export type AgentCarePlannerOutput = {
  care_plan?: Record<string, unknown>;
  today_tasks?: AgentTaskOutput[];
  backend_actions?: Array<{
    action: string;
    task?: AgentTaskOutput;
    task_id?: string | number;
    message?: string;
    data?: Record<string, unknown>;
  }>;
  dashboard_companion?: {
    message?: string;
    question?: string;
    greeting?: string;
    proactive_message?: string;
  };
  notifications?: unknown[];
  health_score?: number;
  compliance_score?: number;
};
