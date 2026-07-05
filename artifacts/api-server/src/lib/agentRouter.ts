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

// Describes the Action Plan output schema Agent 3 (Intelligent Care Planner) must
// produce for every plan object it returns, either as `care_plan` or inside
// `backend_actions[].plan` for CREATE_PLAN / UPDATE_PLAN actions.
const PLAN_OUTPUT_SCHEMA = {
  title: "string — short plan name",
  description: "string — what the plan involves and why",
  category: "string — one of: medication | diet | fitness | recovery | custom",
  start_date: "string (YYYY-MM-DD) — when the plan begins",
  end_date: "string (YYYY-MM-DD) — when the plan is expected to end",
  duration_days: "integer — total number of days the plan spans",
  completed_days: "integer — number of days completed so far (0 for new plans)",
  remaining_days: "integer — number of days left (duration_days - completed_days)",
  progress_percentage: "integer 0-100 — completed_days / duration_days * 100",
  current_day: "integer — which day of the plan the user is currently on (1-indexed)",
  status: "string — one of: active | completed | cancelled",
  tasks: "array of task objects — the concrete actions associated with this plan, each with title/description/category/priority/due_time/recurrence",
};

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
  currentPlans?: unknown[];
}) {
  return {
    user_profile: opts.userProfile,
    health_assessment: opts.healthAssessment ?? {},
    nutrition_plan: opts.nutritionPlan ?? {},
    medical_conditions: opts.medicalConditions,
    current_medications: opts.currentMedications,
    daily_logs: opts.dailyLogs,
    current_tasks: opts.currentTasks,
    current_plans: opts.currentPlans ?? [],
    previous_progress: [],
    calendar: {},
    recovery_status: {},
    emergency_output: {},
    user_message: opts.userMessage ?? "",
    conversation_history: opts.conversationHistory ?? [],
    // Tells Agent 3 the exact Action Plan shape the backend expects when it
    // returns a `care_plan` or a CREATE_PLAN/UPDATE_PLAN backend_action.
    plan_output_schema: PLAN_OUTPUT_SCHEMA,
    instructions:
      "When proposing or updating a recovery/care plan, always produce a full Action Plan object " +
      "matching plan_output_schema (title, description, category, start_date, end_date, duration_days, " +
      "completed_days, remaining_days, progress_percentage, current_day, status, tasks) instead of a bare " +
      "list of tasks. Include it as `care_plan` in the response, and emit a CREATE_PLAN (or UPDATE_PLAN, " +
      "with plan_id, if modifying an existing plan from current_plans) backend_action carrying the same " +
      "object under `plan`. Standalone day-to-day to-dos that are not part of a multi-day plan can still be " +
      "returned as `today_tasks` / CREATE_TASK actions.",
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

export type AgentPlanOutput = {
  id?: string | number;
  title: string;
  type?: string;
  category?: string;
  description?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  duration_days?: number;
  completed_days?: number;
  remaining_days?: number;
  progress_percentage?: number;
  current_day?: number;
  tasks?: AgentTaskOutput[];
};

export type AgentCarePlannerOutput = {
  care_plan?: Record<string, unknown>;
  today_tasks?: AgentTaskOutput[];
  backend_actions?: Array<{
    action: string;
    task?: AgentTaskOutput;
    task_id?: string | number;
    plan?: AgentPlanOutput;
    plan_id?: string | number;
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
