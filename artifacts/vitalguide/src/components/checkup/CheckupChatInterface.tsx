import { useState, useRef, useEffect, forwardRef, useImperativeHandle, useCallback } from "react";
import { Send, Bot, User, AlertTriangle, WifiOff, Loader2, Stethoscope, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getGetConversationMessagesQueryKey } from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import AssessmentCard, { type AssessmentData, type NutritionData } from "./AssessmentCard";
import EmergencyBanner, { type EmergencyData } from "./EmergencyBanner";
import ProfileUpdateDialog from "./ProfileUpdateDialog";

export interface CheckupChatHandle {
  sendMessage: (text: string) => void;
}

interface LocalMessage {
  id: number;
  role: string;
  content: string;
  createdAt: string;
}

interface CheckupChatProps {
  conversationId: number;
  initialMessages?: LocalMessage[];
  autoPrompt?: string;
}

type AgentStatus = "idle" | "thinking" | "done" | "error";

type StoredAssessment = {
  assessment: AssessmentData;
  emergencyData: EmergencyData | null;
  nutritionData: NutritionData | null;
};

const THINKING_MESSAGES = [
  "Analyzing your symptoms…",
  "Consulting health assessment AI…",
  "Processing medical context…",
  "Reviewing your health profile…",
  "Preparing personalized guidance…",
];

const CheckupChatInterface = forwardRef<CheckupChatHandle, CheckupChatProps>(function CheckupChatInterface(
  { conversationId, initialMessages = [], autoPrompt },
  ref,
) {
  const [messages, setMessages] = useState<LocalMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [agentStatus, setAgentStatus] = useState<AgentStatus>("idle");
  const [thinkingMsg, setThinkingMsg] = useState(THINKING_MESSAGES[0]);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [assessment, setAssessment] = useState<AssessmentData | null>(null);
  const [emergencyData, setEmergencyData] = useState<EmergencyData | null>(null);
  const [nutritionData, setNutritionData] = useState<NutritionData | null>(null);
  const [newTasksCount, setNewTasksCount] = useState(0);
  const [profileSuggestions, setProfileSuggestions] = useState<Record<string, unknown> | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const autoPromptFiredRef = useRef(false);
  const thinkingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset when conversation changes
  useEffect(() => {
    setMessages(initialMessages);
    setAssessment(null);
    setEmergencyData(null);
    setNutritionData(null);
    setNewTasksCount(0);
    setProfileSuggestions(null);
    setAgentStatus("idle");
    setErrorText(null);
    autoPromptFiredRef.current = false;

    // Fetch stored assessment if conversation already completed
    fetch(`/api/checkup-agent/conversations/${conversationId}/assessment`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then((data: { assessment: StoredAssessment | null } | null) => {
        if (data?.assessment) {
          const stored = data.assessment;
          setAssessment(stored.assessment);
          setEmergencyData(stored.emergencyData);
          setNutritionData(stored.nutritionData);
          setAgentStatus("done");
        }
      })
      .catch(() => null);
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (initialMessages.length > 0) setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, agentStatus, assessment]);

  // Rotating thinking message
  useEffect(() => {
    if (agentStatus === "thinking") {
      let idx = 0;
      thinkingIntervalRef.current = setInterval(() => {
        idx = (idx + 1) % THINKING_MESSAGES.length;
        setThinkingMsg(THINKING_MESSAGES[idx]);
      }, 3000);
    } else {
      if (thinkingIntervalRef.current) clearInterval(thinkingIntervalRef.current);
    }
    return () => { if (thinkingIntervalRef.current) clearInterval(thinkingIntervalRef.current); };
  }, [agentStatus]);

  const sendText = useCallback(async (content: string) => {
    if (!content.trim() || agentStatus === "thinking") return;

    setErrorText(null);
    const userMsg: LocalMessage = { id: Date.now(), role: "user", content, createdAt: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setAgentStatus("thinking");
    setThinkingMsg(THINKING_MESSAGES[0]);

    try {
      const res = await fetch(`/api/checkup-agent/conversations/${conversationId}/message`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
        throw new Error(body.error ?? `Request failed with status ${res.status}`);
      }

      const data = await res.json() as {
        userMessage: LocalMessage;
        assistantMessage: LocalMessage;
        status: "follow_up" | "assessment_complete" | "error";
        assessment?: AssessmentData;
        emergencyData?: EmergencyData | null;
        nutritionData?: NutritionData | null;
        newTasks?: unknown[];
        profileSuggestions?: Record<string, unknown> | null;
        error?: string;
      };

      // Replace optimistic user message with server-persisted one
      setMessages(prev => [
        ...prev.filter(m => m.id !== userMsg.id),
        data.userMessage,
        data.assistantMessage,
      ]);

      if (data.status === "assessment_complete" && data.assessment) {
        setAssessment(data.assessment);
        setEmergencyData(data.emergencyData ?? null);
        setNutritionData(data.nutritionData ?? null);
        setNewTasksCount(data.newTasks?.length ?? 0);
        if (data.profileSuggestions && Object.keys(data.profileSuggestions).length > 0) {
          setProfileSuggestions(data.profileSuggestions);
          setProfileDialogOpen(true);
        }
        setAgentStatus("done");
      } else if (data.status === "error") {
        setErrorText(data.error ?? "Agent encountered an error. Please try again.");
        setAgentStatus("idle");
      } else {
        // follow_up — keep chatting
        setAgentStatus("idle");
      }

      queryClient.invalidateQueries({ queryKey: getGetConversationMessagesQueryKey(conversationId) });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error. Please check your connection.";
      setErrorText(msg);
      setMessages(prev => prev.filter(m => m.id !== userMsg.id));
      setAgentStatus("idle");
    }
  }, [conversationId, agentStatus]);

  // Auto-prompt on mount
  useEffect(() => {
    if (autoPrompt && !autoPromptFiredRef.current && agentStatus === "idle") {
      autoPromptFiredRef.current = true;
      const timer = setTimeout(() => sendText(autoPrompt), 400);
      return () => clearTimeout(timer);
    }
  }, [autoPrompt, agentStatus, sendText]);

  useImperativeHandle(ref, () => ({
    sendMessage: (text: string) => sendText(text),
  }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const text = input;
    setInput("");
    sendText(text);
  };

  const isThinking = agentStatus === "thinking";
  const isDone = agentStatus === "done";

  return (
    <div className="flex flex-col h-full bg-white rounded-xl overflow-hidden w-full">
      {/* Emergency Banner — pinned at top */}
      {emergencyData && (
        <div className="p-4 border-b border-red-200 flex-shrink-0">
          <EmergencyBanner emergencyData={emergencyData} />
        </div>
      )}

      {/* Simple emergency detection in messages (fallback) */}
      {!emergencyData && messages.some(m => m.role === "assistant" && (
        m.content.toLowerCase().includes("emergency") ||
        m.content.toLowerCase().includes("call 911") ||
        m.content.toLowerCase().includes("seek immediate")
      )) && (
        <div className="mx-4 mt-3 flex-shrink-0 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800 font-medium">Medical emergency detected. Please seek immediate professional medical attention or call emergency services.</p>
        </div>
      )}

      {/* Error banner */}
      {errorText && (
        <div className="mx-4 mt-3 flex-shrink-0 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2.5 flex items-center gap-2.5">
          <WifiOff className="h-4 w-4 text-orange-600 flex-shrink-0" />
          <p className="text-sm text-orange-800 flex-1">{errorText}</p>
          <button onClick={() => setErrorText(null)} className="text-xs text-orange-600 hover:text-orange-800 font-medium">✕</button>
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 p-4 md:p-6">
        <div className="space-y-6">
          {messages.length === 0 && !isThinking && (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 py-16 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4 bg-teal-100 text-teal-700">
                <Stethoscope className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-medium text-slate-900">Describe your symptoms</h3>
              <p className="mt-1 max-w-xs text-sm text-slate-500">
                The AI Health Assessment Agent will ask follow-up questions and provide a personalized assessment.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                {["I have a headache and fever", "My stomach hurts after eating", "I feel tired all the time", "I have chest tightness"].map(s => (
                  <button
                    key={s}
                    onClick={() => { setInput(s); }}
                    className="text-xs bg-teal-50 text-teal-700 border border-teal-100 rounded-full px-3 py-1.5 hover:bg-teal-100 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 md:gap-4 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${
                msg.role === "user" ? "bg-teal-600 text-white" : "bg-teal-100 text-teal-700"
              }`}>
                {msg.role === "user" ? <User className="w-3.5 h-3.5 md:w-4 md:h-4" /> : <Bot className="w-3.5 h-3.5 md:w-4 md:h-4" />}
              </div>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm md:text-[15px] leading-relaxed shadow-sm ${
                msg.role === "user"
                  ? "bg-teal-600 text-white rounded-tr-sm"
                  : "bg-teal-50 text-teal-900 border border-teal-100 rounded-tl-sm"
              }`}>
                <div className="whitespace-pre-wrap font-sans break-words">{msg.content}</div>
              </div>
            </div>
          ))}

          {/* Thinking indicator */}
          {isThinking && (
            <div className="flex gap-3 md:gap-4">
              <div className="w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1 bg-teal-100 text-teal-700">
                <Bot className="w-3.5 h-3.5 md:w-4 md:h-4" />
              </div>
              <div className="bg-teal-50 border border-teal-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center gap-3 max-w-xs">
                <div className="relative flex-shrink-0">
                  <Sparkles className="w-4 h-4 text-teal-500 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Loader2 className="w-3 h-3 text-teal-500 animate-spin" />
                    <span className="text-xs font-semibold text-teal-700">Agent is working</span>
                  </div>
                  <p className="text-xs text-teal-600 italic">{thinkingMsg}</p>
                  <p className="text-[10px] text-teal-400 mt-0.5">This may take 30–90 seconds…</p>
                </div>
              </div>
            </div>
          )}

          {/* Assessment card — shown when complete */}
          {isDone && assessment && (
            <div className="mt-2">
              <AssessmentCard
                assessment={assessment}
                nutrition={nutritionData}
                newTasksCount={newTasksCount}
              />
            </div>
          )}

          <div ref={bottomRef} className="h-2" />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className={`p-3 md:p-4 border-t border-slate-100 bg-slate-50/80 flex-shrink-0 ${isDone ? "opacity-70" : ""}`}>
        {isDone ? (
          <p className="text-center text-sm text-slate-500 py-1">
            Assessment complete. Start a new session to assess different symptoms.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex gap-2 md:gap-3 max-w-4xl mx-auto">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={isThinking ? "Agent is working…" : "Describe your symptoms or answer the question…"}
              className="flex-1 bg-white border-slate-200 shadow-sm h-11 md:h-12 text-sm md:text-base rounded-full px-4 md:px-5 focus-visible:ring-teal-600"
              disabled={isThinking}
            />
            <Button
              type="submit"
              disabled={!input.trim() || isThinking}
              className="h-11 w-11 md:h-12 md:w-12 rounded-full p-0 flex-shrink-0 bg-teal-600 hover:bg-teal-700 text-white shadow-sm"
            >
              {isThinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 md:w-5 md:h-5 ml-0.5" />}
            </Button>
          </form>
        )}
      </div>

      {/* Profile Update Dialog */}
      {profileSuggestions && (
        <ProfileUpdateDialog
          open={profileDialogOpen}
          suggestions={profileSuggestions}
          onClose={() => setProfileDialogOpen(false)}
        />
      )}
    </div>
  );
});

export default CheckupChatInterface;
